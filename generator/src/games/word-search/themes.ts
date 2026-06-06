// generator/src/games/word-search/themes.ts
// Themed word banks. Flavor lives here (kid-appropriate, single uppercase words,
// A–Z only); the placement logic stays in generate.ts. Each bank carries plenty
// of short (3–6 letter) words so even the smallest 8×8 grade-1 grid fills easily.
export interface Theme { name: string; words: string[]; }

export const THEMES: Theme[] = [
  {
    name: "Animals",
    words: [
      "CAT", "DOG", "COW", "OWL", "FOX", "BAT", "BEE", "HEN",
      "FROG", "GOAT", "DEER", "WOLF", "LION", "BEAR", "SEAL", "CRAB", "DUCK", "FISH",
      "TIGER", "ZEBRA", "HORSE", "MOUSE", "SNAKE", "WHALE", "SHARK", "KOALA", "PANDA", "CAMEL",
      "RABBIT", "MONKEY", "TURTLE", "PARROT", "PENGUIN", "DOLPHIN", "ELEPHANT", "KANGAROO",
    ],
  },
  {
    name: "Space",
    words: [
      "SUN", "MOON", "STAR", "MARS", "DUST",
      "COMET", "ORBIT", "VENUS", "EARTH", "PLUTO", "SOLAR", "LUNAR",
      "ROCKET", "PLANET", "GALAXY", "SATURN", "METEOR", "COSMOS", "NEBULA", "URANUS",
      "JUPITER", "NEPTUNE", "MERCURY", "ASTEROID", "ASTRONAUT",
    ],
  },
  {
    name: "Ocean",
    words: [
      "SEA", "FIN", "WAVE", "REEF", "KELP", "TIDE", "CRAB", "FISH", "CLAM",
      "SHELL", "CORAL", "SQUID", "PEARL", "WHALE", "SHARK", "OTTER", "OCEAN", "DIVER",
      "TURTLE", "SPONGE", "URCHIN", "LOBSTER", "DOLPHIN", "OCTOPUS", "SEAWEED", "STARFISH",
    ],
  },
  {
    name: "Food",
    words: [
      "PIE", "JAM", "EGG", "NUT",
      "APPLE", "BREAD", "GRAPE", "MANGO", "PEACH", "LEMON", "BERRY", "BEANS", "HONEY", "PASTA", "SALAD", "PIZZA", "MELON",
      "CHEESE", "BANANA", "CARROT", "ORANGE", "TOMATO", "COOKIE", "MUFFIN", "PRETZEL", "PANCAKE", "SANDWICH",
    ],
  },
  {
    name: "Nature",
    words: [
      "SUN", "SKY", "ICE", "MUD",
      "TREE", "LEAF", "RAIN", "SNOW", "ROCK", "HILL", "LAKE", "WIND",
      "RIVER", "CLOUD", "STONE", "GRASS", "PLANT", "STORM", "BEACH", "FIELD",
      "FLOWER", "FOREST", "VALLEY", "DESERT", "ISLAND", "MEADOW", "CANYON", "RAINBOW", "MOUNTAIN",
    ],
  },
  {
    name: "Sports",
    words: [
      "RUN", "BAT", "NET", "GYM", "SKI",
      "BALL", "GOAL", "SWIM", "DIVE", "SURF", "KICK", "JUMP", "RACE", "PUCK",
      "SKATE", "RUGBY", "RELAY", "MEDAL", "COACH", "FIELD",
      "SOCCER", "TENNIS", "HOCKEY", "BOXING", "ROWING", "RUNNER", "ARCHERY", "BOWLING", "BASEBALL",
    ],
  },
];
