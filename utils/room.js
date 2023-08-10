class Room {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = [];
    this.questionManager = null;
    this.answers = {};
    this.totalAnswers = {};
    this.countdownTimer = null;
    this.countdownTimerInterval = null;
    this.timer = null;
    this.timerInterval = null;
    this.answerCount = 0;
    this.answerCounts = [0, 0, 0, 0];
    this.admin = null;
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
