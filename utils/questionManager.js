class QuestionManager {
  constructor(questions) {
    this.questions = questions;
    this.currentQuestionIndex = 0;
    this.answers = {};
    this.answerCount = 0;
  }

  getCurrentQuestion() {
    return this.questions[this.currentQuestionIndex];
  }

  allPlayersAnswered(players) {
    return players.every((player) => this.answers[player.id] !== undefined);
  }

  submitAnswer(playerId, answer) {
    this.answers[playerId] = answer;
    this.answerCount++;
  }

  isCorrectAnswer(answer) {
    const currentQuestion = this.questions[this.currentQuestionIndex];
    return currentQuestion.correctAnswer === answer;
  }

  nextQuestion() {
    this.currentQuestionIndex++;
    this.answers = {};
    this.answerCount = 0;
  }

  getAnswerCount() {
    return this.answerCount;
  }

  getCurrentQuestionIndex() {
    return this.currentQuestionIndex;
  }

  hasMoreQuestions() {
    return this.currentQuestionIndex < this.questions.length;
  }
}

module.exports = { QuestionManager };
