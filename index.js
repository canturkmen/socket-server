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

  console.log(gameData);

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
        powerUps: {},
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
        socket.to(data.roomId).emit("adminLeft");
        room.reset();
        delete rooms[data.roomId];
      } else {
        socket.to(data.roomId).emit("updateWaitingRoom", room.getPlayers());
        socket
          .to(data.roomId)
          .emit("updateConnectionCount", room.getPlayers().length);
        room.removePlayer(data.username);
      }
      socket.leave(data.roomId);
    } else {
      socket.emit("error", new Error("Room not found!"));
    }
  });

  socket.on("updateUserOptions", async (gameData) => {
    const room = rooms[gameData.roomId];
    if (room) {
      const currentPlayerIndex = room.players.findIndex(
        (player) => player.username === gameData.username
      );

      if (currentPlayerIndex !== -1) {
        room.players[currentPlayerIndex].powerUps = gameData.powerUps;
      }
    }
  });

  socket.on("startGame", async (startGameData) => {
    const room = rooms[startGameData.roomId];
    if (room && !room.questionManager) {
      for (playerIndex in room.players) {
        room.players[playerIndex].powerUps = startGameData.selectedOptions;
      }

      clearInterval(room.countdownTimerInterval);
      room.timer = startGameData.timer;
      room.TIME_LIMIT = startGameData.timer;
      room.questionManager = new QuestionManager(startGameData.data.content);
      room.totalQuestions = startGameData.data.content.length;
    }
  });

  socket.on("startCountdownTimer", (roomId) => {
    if (rooms[roomId]) {
      rooms[roomId].startCountdownTimer(io);
    }
  });

  socket.on("startTimer", (roomId) => {
    if (rooms[roomId]) {
      rooms[roomId].startTimer(io);
    }
  });

  socket.on("getTotalQuestions", (roomId) => {
    const room = rooms[roomId];
    if (room) {
      const data = {
        totalQuestions: room.totalQuestions,
        currentQuestion: room.questionManager.getCurrentQuestionIndex() + 1,
      };
      socket.emit("updateTotalQuestions", data);
    }
  });

  socket.on("getFirstQuestion", (gameData) => {
    const room = rooms[gameData.roomId];
    const isFirstQuestion =
      room.questionManager.getCurrentQuestionIndex() === 0;
    if (isFirstQuestion) {
      const currentPlayer = room.players.find(
        (player) => player.username === gameData.username
      );

      if (currentPlayer) {
        socket.emit(
          "updateFirstQuestion",
          room.questionManager.getCurrentQuestion(),
          currentPlayer.powerUps
        );
      } else {
        socket.emit(
          "updateFirstQuestion",
          room.questionManager.getCurrentQuestion(),
          {
            halve: false,
            doubleScore: false,
            chatGPT: false,
          }
        );
      }
    }
  });

  socket.on("getPercentages", (roomId) => {
    const room = rooms[roomId];
    if (room) {
      socket.emit("updatePercentages", room.answerCounts);
    }
  });

  socket.on(
    "submitAnswer",
    (roomId, username, answer, optionIndex, factor, isDoubleScore) => {
      const room = rooms[roomId];
      let player = room.players.find((player) => player.username === username);
      if (room && room.questionManager) {
        room.answerCounts[optionIndex]++;
        room.answerCount++;
        let isCorrect = false;
        if (player && room.questionManager.isCorrectAnswer(answer)) {
          if (isDoubleScore) {
            player.score += 100 * (factor / 30) * 2;
          } else {
            player.score += 100 * (factor / 30);
          }
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
          room.timer = room.TIME_LIMIT;
          clearInterval(room.timerInterval);
          socket.to(roomId).emit("showResults");
          socket.emit("showResults");
        }
      }
    }
  );

  socket.on("showLeaderboard", (roomId) => {
    const room = rooms[roomId];
    if (room) {
      setTimeout(() => {
        socket.emit("navigateLaderboard");
      }, 2500);
    }
  });

  socket.on("getTotalUsers", (roomId) => {
    const room = rooms[roomId];
    const totalUsers = room.players.length;
    socket.emit("updateTotalUsers", totalUsers);
  });

  socket.on("getUserOptions", (gameData) => {
    const room = rooms[gameData.roomId];
    if (room) {
      const player = room.players.find(
        (player) => player.username === gameData.username
      );
      if (player) {
        socket.emit("updateUserOptions", player.powerUps);
      } else {
        socket.emit("updateUserOptions", {
          halve: false,
          doubleScore: false,
          chatGPT: false,
        });
      }
    }
  });

  socket.on("nextQuestion", (roomId) => {
    const room = rooms[roomId];
    if (room) {
      room.answers = {};
      room.answerCounts = [0, 0, 0, 0];
      room.answerCount = 0;
      room.questionManager.nextQuestion();
      if (room && !room.questionManager.hasMoreQuestions()) {
        setTimeout(() => {
          socket.emit("isLastQuestion");
          socket.to(roomId).emit("isLastQuestion");
        }, 4500);
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
        }, 4500);
      }
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
