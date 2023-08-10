const express = require("express");
const app = express();
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { Room } = require("./utils/room");
const { QuestionManager } = require("./utils/questionManager");

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://mc-turkmen.jotform.dev",
    methods: ["GET", "POST"],
  },
});

app.use(
  cors({
    origin: "https://mc-turkmen.jotform.dev",
  })
);

const rooms = {};
const TIME_LIMIT = 30;
const COUNTDOWN_LIMIT = 5;

function startCountdownTimer(roomId) {
  const room = rooms[roomId];
  if (room) {
    if (room.countdownTimerInterval) {
      clearInterval(room.countdownTimerInterval);
    }
    room.countdownTimer = COUNTDOWN_LIMIT;
    io.to(roomId).emit("countdownTimer", room.countdownTimer);
    room.countdownTimerInterval = setInterval(() => {
      room.countdownTimer--;
      io.to(roomId).emit("countdownTimer", room.countdownTimer);
      if (room.countdownTimer <= 0) {
        clearInterval(room.countdownTimerInterval);
        io.to(roomId).emit("countdownFinished");
      }
    }, 1000);
  }
}

function startTimer(roomId) {
  const room = rooms[roomId];
  if (room) {
    if (room.timerInterval) {
      clearInterval(room.timer);
    }
    room.timer = TIME_LIMIT;
    io.to(roomId).emit("timer", room.timer);
    room.timerInterval = setInterval(() => {
      room.timer--;
      io.to(roomId).emit("timer", room.timer);
      if (room.timer <= 0 || room.isAllAnswered()) {
        clearInterval(room.timerInterval);
        io.to(roomId).emit("timeout");
      }
    }, 1000);
  }
}

function collectGameData(roomId) {
  const room = rooms[roomId];
  if (!room) {
    throw new Error("Room not found!");
  }

  const gameData = {
    form_id: roomId,
    usernames: room.players.map((player) => player.username),
    score: {},
    answers: {},
  };

  room.players.forEach((player) => {
    gameData.score[player.username] = player.score;
    gameData.answers[player.username] = {};
    for (let i = 0; i < room.questionManager.questions.length; i++) {
      if (
        room.totalAnswers[player.username] &&
        room.totalAnswers[player.username][i]
      ) {
        gameData.answers[player.username][i] =
          room.totalAnswers[player.username][i];
      } else {
        gameData.answers[player.username][i] = {
          userAnswer: "",
          qid: "",
          time: 30, // Or any other default value
          correctAnswer: "",
          point: 0,
        };
      }
    }
  });

  return gameData;
}

io.on("connection", (socket) => {
  socket.on("createQuiz", (createData) => {
    rooms[createData.roomId] = new Room(createData.roomId);
    const player = {
      username: createData.username,
      roomId: createData.roomId,
      socket: socket.id,
      score: 0,
    };
    rooms[createData.roomId].createAdmin(player);
    socket.join(createData.roomId);
    socket.emit("waitingRoom", createData.roomId);
  });

  socket.on("updateSocketConnection", (playerData) => {
    const { roomId, username } = playerData;
    if (rooms[roomId]) {
      let room = rooms[roomId];
      let player = room.getPlayers().find((player) => player.username);
      if (player) {
        player.socket = socket.id;
        socket.join(roomId);
        socket.emit("getSocketConnection", player.socket);
      } else {
        socket.emit(
          "error",
          new Error("Player not found in the specified room!")
        );
      }
    } else {
      socket.emit("error", new Error("Room not found!"));
    }
  });

  socket.on("joinRoom", (data) => {
    if (rooms[data.roomId] && rooms[data.roomId].hasSpace()) {
      const player = {
        username: data.username,
        roomId: data.roomId,
        socket: socket.id,
        score: 0,
      };
      socket.join(data.roomId);
      rooms[data.roomId].addPlayer(player);
      socket
        .to(data.roomId)
        .emit("updateWaitingRoom", rooms[data.roomId].getPlayers());
      socket.emit("updateWaitingRoom", rooms[data.roomId].getPlayers());

      const roomPlayers = rooms[data.roomId].getPlayersInRoom(data.roomId);
    } else if (!rooms[data.roomId]) {
      socket.emit("joinError", "There is no such room with this ID");
    } else {
      socket.emit("joinError", "Room is full");
    }
  });

  socket.on("notifyWaitingRoom", (roomId) => {
    socket.to(roomId).emit("startGame");
    socket.emit("startGame");
  });

  socket.on("getPlayers", (roomId) => {
    if (rooms[roomId]) {
      socket.emit("updateWaitingRoom", rooms[roomId].getPlayers());
    } else {
      socket.emit("error", new Error("Room not found!"));
    }
  });

  socket.on("playerLeft", (data) => {
    const room = rooms[data.roomId];
    if (room) {
      if (data.username == room.getAdmin().username) {
        room.removeAdmin();
        delete rooms[data.roomId];
        socket.to(data.roomId).emit("adminLeft");
      } else {
        room.removePlayer(data.username);
        socket.to(data.roomId).emit("updateWaitingRoom", room.getPlayers());
        socket
          .to(data.roomId)
          .emit("updateConnectionCount", room.getPlayers().length);
      }
      socket.leave(data.roomId);
    } else {
      socket.emit("error", new Error("Room not found!"));
    }
  });

  socket.on("startGame", async (startGameData) => {
    const room = rooms[startGameData.roomId];
    if (room && !room.questionManager) {
      clearInterval(room.countdownTimerInterval);
      room.questionManager = new QuestionManager(startGameData.data.content);
    }
  });

  socket.on("startCountdownTimer", (roomId) => {
    startCountdownTimer(roomId);
  });

  socket.on("startTimer", (roomId) => {
    startTimer(roomId);
  });

  socket.on("getFirstQuestion", (roomId) => {
    const room = rooms[roomId];
    const isFirstQuestion =
      room.questionManager.getCurrentQuestionIndex() === 0;
    if (isFirstQuestion) {
      socket.emit(
        "updateFirstQuestion",
        room.questionManager.getCurrentQuestion()
      );
    }
  });

  socket.on("getPercentages", (roomId) => {
    const room = rooms[roomId];
    if (room) {
      socket.emit("updatePercentages", room.answerCounts);
    }
  });

  socket.on("submitAnswer", (roomId, username, answer, optionIndex, factor) => {
    const room = rooms[roomId];
    let player = room.players.find((player) => player.username === username);
    if (room && room.questionManager) {
      room.answerCounts[optionIndex]++;
      room.answerCount++;
      let isCorrect = false;
      if (player && room.questionManager.isCorrectAnswer(answer)) {
        player.score += 100 * (factor / 30);
        player.score = Math.floor(player.score);
        isCorrect = true;
      }
      room.addAnswer(username, answer, factor);
      
      socket.emit(
        "submittedAnswer",
        username,
        isCorrect,
        optionIndex,
        player.score,
        room.answerCount
      );

      socket
        .to(room.roomId)
        .emit(
          "submittedAnswer",
          username,
          isCorrect,
          optionIndex,
          player.score,
          room.answerCount
        );

      if (room.isAllAnswered()) {
        clearInterval(room.timerInterval);
        socket.to(roomId).emit("showResults");
        socket.emit("showResults");
      }
    }
  });

  socket.on("showLeaderboard", () => {
    setTimeout(() => {
      socket.emit("navigateLeaderboard");
    }, 7000);
  });

  socket.on("getTotalUsers", (roomId) => {
    const room = rooms[roomId];
    const totalUsers = room.players.length;
    socket.emit("updateTotalUsers", totalUsers);
  });

  socket.on("nextQuestion", (roomId) => {
    const room = rooms[roomId];
    room.answers = {};
    room.answerCounts = [0, 0, 0, 0];
    room.answerCount = 0;
    room.questionManager.nextQuestion();
    if (room && !room.questionManager.hasMoreQuestions()) {
      setTimeout(() => {
        socket.emit("isLastQuestion");
        socket.to(roomId).emit("isLastQuestion");
      }, 7000);
    } else {
      setTimeout(() => {
        socket
          .to(roomId)
          .emit(
            "updateNextQuestion",
            room.questionManager.getCurrentQuestion()
          );
        socket.emit(
          "updateNextQuestion",
          room.questionManager.getCurrentQuestion()
        );
      }, 7000);
    }
  });

  socket.on("getLeaderboard", (roomId) => {
    const room = rooms[roomId];
    if (room) {
      const leaderboard = room.getPlayers().map((player) => {
        return {
          username: player.username,
          score: player.score,
        };
      });

      leaderboard.sort((a, b) => b.score - a.score);
      socket.emit("updateLeaderboard", leaderboard);
    } else {
      socket.emit("error", new Error("Room not found!"));
    }
  });

  socket.on("getTableData", (roomId) => {
    socket.emit("sendTableData", collectGameData(roomId));
  });

  socket.on("tableCreated", (data) => {
    const room = rooms[data.roomId];
    if (room) {
      socket.to(data.roomId).emit("sendTableUrl", data.url);
      socket.emit("sendTableUrl", data.url);
    }
  });

  socket.on("disconnect", () => {
    // for (let roomId in rooms) {
    //   let room = rooms[roomId];
    //   if (room) {
    //     let player = room
    //       .getPlayers()
    //       .find((player) => (player.socket = socket.id));
    //     if (player) {
    //       if (player.username === room.getAdmin().username) {
    //         room.removeAdmin();
    //         delete rooms[roomId];
    //         socket.to(roomId).emit("adminLeft");
    //       } else {
    //         room.removePlayer(player.username);
    //         socket.to(roomId).emit("updateWaitingRoom", room.getPlayers());
    //       }
    //       socket.leave(roomId);
    //       break;
    //     }
    //   }
    // }
  });
});

server.listen(5000, () => {
  console.log("SERVER RUNNING");
});
