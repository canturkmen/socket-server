const COUNTDOWN_LIMIT = 5;
const TIME_LIMIT_CONSTANT = 30;

class Room {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = [];
    this.questionManager = null;
    this.answers = {};
    this.totalAnswers = {};
    this.countdownTimer = COUNTDOWN_LIMIT;
    this.countdownTimerInterval = null;
    this.TIME_LIMIT = TIME_LIMIT_CONSTANT;
    this.timer = TIME_LIMIT_CONSTANT;
    this.timerInterval = null;
    this.answerCount = 0;
    this.answerCounts = [0, 0, 0, 0]; // Assuming 4 answer options
  }

  startCountdownTimer(io) {
    if (this.countdownTimerInterval) {
      clearInterval(this.countdownTimerInterval);
    }
    io.to(this.roomId).emit("countdownTimer", this.countdownTimer);
    this.countdownTimerInterval = setInterval(() => {
      this.countdownTimer--;
      io.to(this.roomId).emit("countdownTimer", this.countdownTimer);
      if (this.countdownTimer <= 0) {
        clearInterval(this.countdownTimerInterval);
        io.to(this.roomId).emit("countdownFinished");
      }
    }, 1000);
  }

  startTimer(io) {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    io.to(this.roomId).emit("timer", this.timer);
    this.timerInterval = setInterval(() => {
      this.timer--;
      io.to(this.roomId).emit("timer", this.timer);
      if (this.timer <= 0 || this.isAllAnswered()) {
        clearInterval(this.timerInterval);
        io.to(this.roomId).emit("timeout");
        this.timer = this.TIME_LIMIT;
      }
    }, 1000);
  }

  createAdmin(admin) {
    this.admin = admin;
  }

  addPlayer(player) {
    this.players.push(player);
    return player;
  }

  addAnswer(username, answer, time) {
    this.answers[username] = answer;
    this.totalAnswers[username] = {
      ...this.totalAnswers[username],
      [this.questionManager.getCurrentQuestionIndex()]: {
        userAnswer: answer,
        time: time,
        correctAnswer: this.questionManager.getCurrentQuestion().correctAnswer,
        qid: this.questionManager.getCurrentQuestion().id,
        point: this.players.find((player) => player.username === username)
          .score,
      },
    };
  }

  isAllAnswered() {
    return Object.keys(this.answers).length === this.players.length;
  }

  removePlayer(username) {
    this.players = this.players.filter(
      (player) => player.username !== username
    );
  }

  removeAdmin() {
    this.admin = null;
  }

  getPlayers() {
    return this.players;
  }

  getAdmin() {
    return this.admin;
  }

  getPlayersInRoom(roomId) {
    return this.players.filter((player) => player.roomId === roomId);
  }

  hasSpace() {
    return this.players.length < 100;
  }
}

module.exports = { Room };
