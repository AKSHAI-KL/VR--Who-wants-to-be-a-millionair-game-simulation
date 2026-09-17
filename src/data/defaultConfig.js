// Default game configuration.
// This entire object is what the Game Editor reads/writes, persists to
// localStorage, and exports/imports as JSON. Nothing here is baked into
// the 3D scene — the scene only ever renders whatever config it is given.

export const defaultConfig = {
  title: "WHO WANTS TO BE A MILLIONAIRE?",
  theme: {
    primaryColor: "#7c3aed",   // studio purple
    accentColor: "#f2c94c",    // gold highlights
    screenColor: "#0b1030"     // deep blue screen background
  },
  audio: {
    muted: false,
    volume: 0.6,
    voiceEnabled: true
  },
  finalMessage: "CONGRATULATIONS! YOU'VE COMPLETED THE GAME!",
  hostDialogue: {
    welcome: "Welcome to the studio! Take a seat — let's play!",
    questionIntro: "Here comes your next question!",
    correct: "That's absolutely correct!",
    incorrect: "I'm afraid that's not the right answer.",
    // Spoken when the run is terminated after a wrong answer (the only exit
    // from the game besides winning all five questions).
    gameOver: "I'm sorry — that answer ends your game. Thank you for playing!",
    thinking: "Take your time, think it through...",
    // Spoken when each of the three (once-per-game) lifelines is used.
    audiencePoll: "Let's ask the audience!",
    fiftyFifty: "Fifty-fifty — let me take two wrong answers away.",
    phoneFriend: "Let's phone a friend — they usually know!",
    final: "Congratulations! You've completed the game!"
  },
  prizes: [1000, 5000, 25000, 100000, 1000000],
  questions: [
    {
      id: 1,
      question: "What is the capital of France?",
      options: ["Rome", "Paris", "Madrid", "Berlin"],
      correctAnswer: 1,
      prize: 1000,
      hostIntro: "Let's begin with your first question!"
    },
    {
      id: 2,
      question: "Which planet is known as the Red Planet?",
      options: ["Venus", "Jupiter", "Mars", "Saturn"],
      correctAnswer: 2,
      prize: 5000,
      hostIntro: "Great start! Here's question two."
    },
    {
      id: 3,
      question: "Who wrote the play 'Romeo and Juliet'?",
      options: ["Charles Dickens", "William Shakespeare", "Mark Twain", "Jane Austen"],
      correctAnswer: 1,
      prize: 25000,
      hostIntro: "Halfway there! Question three coming up."
    },
    {
      id: 4,
      question: "What is the largest ocean on Earth?",
      options: ["Atlantic Ocean", "Indian Ocean", "Arctic Ocean", "Pacific Ocean"],
      correctAnswer: 3,
      prize: 100000,
      hostIntro: "You're doing brilliantly! Question four."
    },
    {
      id: 5,
      question: "In computing, what does 'CPU' stand for?",
      options: [
        "Central Processing Unit",
        "Computer Personal Unit",
        "Central Program Utility",
        "Core Processing Unit"
      ],
      correctAnswer: 0,
      prize: 1000000,
      hostIntro: "This is it — the final question, for the top prize!"
    }
  ]
};

export const REQUIRED_QUESTION_COUNT = 5;
export const REQUIRED_OPTION_COUNT = 4;
