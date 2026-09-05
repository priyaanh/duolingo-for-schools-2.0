/*
 * Course content for Duolingo for Schools 2.0 (unofficial remake).
 * All content below is original demo material written for this project.
 */

/* In every course, word/sentence key "es" holds the target-language text
   (kept as "es" for compatibility) and "en" the English translation. */

const SPANISH = {
  id: "es",
  title: "Spanish",
  flag: "🇪🇸",
  lang: "es-ES",
  langName: "Spanish",
  skills: [
    {
      id: "basics",
      title: "Basics",
      icon: "🧱",
      words: [
        { es: "el hombre", en: "the man" },
        { es: "la mujer", en: "the woman" },
        { es: "el niño", en: "the boy" },
        { es: "la niña", en: "the girl" },
        { es: "yo", en: "I" },
        { es: "tú", en: "you" },
        { es: "sí", en: "yes" },
        { es: "no", en: "no" }
      ],
      sentences: [
        { es: "yo soy una mujer", en: "I am a woman" },
        { es: "él es un niño", en: "he is a boy" },
        { es: "tú eres un hombre", en: "you are a man" },
        { es: "ella es una niña", en: "she is a girl" }
      ]
    },
    {
      id: "greetings",
      title: "Greetings",
      icon: "👋",
      words: [
        { es: "hola", en: "hello" },
        { es: "adiós", en: "goodbye" },
        { es: "gracias", en: "thank you" },
        { es: "por favor", en: "please" },
        { es: "buenos días", en: "good morning" },
        { es: "buenas noches", en: "good night" },
        { es: "bien", en: "well" },
        { es: "muy", en: "very" }
      ],
      sentences: [
        { es: "hola, ¿cómo estás?", en: "hello, how are you?" },
        { es: "gracias y adiós", en: "thank you and goodbye" },
        { es: "estoy muy bien", en: "I am very well" },
        { es: "hola y buenos días", en: "hello and good morning" }
      ]
    },
    {
      id: "food",
      title: "Food",
      icon: "🍎",
      words: [
        { es: "la manzana", en: "the apple" },
        { es: "el pan", en: "the bread" },
        { es: "la leche", en: "the milk" },
        { es: "el agua", en: "the water" },
        { es: "el café", en: "the coffee" },
        { es: "el arroz", en: "the rice" },
        { es: "la fruta", en: "the fruit" },
        { es: "el queso", en: "the cheese" }
      ],
      sentences: [
        { es: "yo como pan", en: "I eat bread" },
        { es: "ella bebe leche", en: "she drinks milk" },
        { es: "el niño come una manzana", en: "the boy eats an apple" },
        { es: "nosotros bebemos café", en: "we drink coffee" }
      ]
    },
    {
      id: "animals",
      title: "Animals",
      icon: "🐴",
      words: [
        { es: "el perro", en: "the dog" },
        { es: "el gato", en: "the cat" },
        { es: "el caballo", en: "the horse" },
        { es: "el pájaro", en: "the bird" },
        { es: "el pez", en: "the fish" },
        { es: "la vaca", en: "the cow" },
        { es: "el oso", en: "the bear" },
        { es: "el ratón", en: "the mouse" }
      ],
      sentences: [
        { es: "el gato bebe leche", en: "the cat drinks milk" },
        { es: "el perro come pan", en: "the dog eats bread" },
        { es: "yo tengo un caballo", en: "I have a horse" },
        { es: "la vaca es grande", en: "the cow is big" }
      ]
    },
    {
      id: "family",
      title: "Family",
      icon: "👪",
      words: [
        { es: "la madre", en: "the mother" },
        { es: "el padre", en: "the father" },
        { es: "el hermano", en: "the brother" },
        { es: "la hermana", en: "the sister" },
        { es: "la abuela", en: "the grandmother" },
        { es: "el abuelo", en: "the grandfather" },
        { es: "el hijo", en: "the son" },
        { es: "la hija", en: "the daughter" }
      ],
      sentences: [
        { es: "él es mi hermano", en: "he is my brother" },
        { es: "mi padre bebe café", en: "my father drinks coffee" },
        { es: "la abuela come pan", en: "the grandmother eats bread" },
        { es: "mi madre es doctora", en: "my mother is a doctor" }
      ]
    },
    {
      id: "colors",
      title: "Colors",
      icon: "🎨",
      words: [
        { es: "rojo", en: "red" },
        { es: "azul", en: "blue" },
        { es: "verde", en: "green" },
        { es: "amarillo", en: "yellow" },
        { es: "negro", en: "black" },
        { es: "blanco", en: "white" },
        { es: "rosado", en: "pink" },
        { es: "marrón", en: "brown" }
      ],
      sentences: [
        { es: "el gato es negro", en: "the cat is black" },
        { es: "la manzana es roja", en: "the apple is red" },
        { es: "mi caballo es blanco", en: "my horse is white" },
        { es: "el pájaro es azul", en: "the bird is blue" }
      ]
    },
    {
      id: "numbers",
      title: "Numbers",
      icon: "🔢",
      words: [
        { es: "uno", en: "one" },
        { es: "dos", en: "two" },
        { es: "tres", en: "three" },
        { es: "cuatro", en: "four" },
        { es: "cinco", en: "five" },
        { es: "seis", en: "six" },
        { es: "siete", en: "seven" },
        { es: "ocho", en: "eight" }
      ],
      sentences: [
        { es: "yo tengo dos gatos", en: "I have two cats" },
        { es: "ella tiene tres hermanos", en: "she has three brothers" },
        { es: "cuatro manzanas rojas", en: "four red apples" },
        { es: "cinco perros grandes", en: "five big dogs" }
      ]
    },
    {
      id: "phrases",
      title: "Phrases",
      icon: "💬",
      words: [
        { es: "de nada", en: "you are welcome" },
        { es: "lo siento", en: "I am sorry" },
        { es: "no lo sé", en: "I do not know" },
        { es: "tal vez", en: "maybe" },
        { es: "hasta luego", en: "see you later" },
        { es: "bienvenido", en: "welcome" },
        { es: "mucho gusto", en: "nice to meet you" },
        { es: "claro", en: "of course" }
      ],
      sentences: [
        { es: "lo siento, no lo sé", en: "I am sorry, I do not know" },
        { es: "hasta luego, mi hermano", en: "see you later, my brother" },
        { es: "bienvenido a mi casa", en: "welcome to my house" },
        { es: "mucho gusto, yo soy Ana", en: "nice to meet you, I am Ana" }
      ]
    }
  ]
};

const FRENCH = {
  id: "fr",
  title: "French",
  flag: "🇫🇷",
  lang: "fr-FR",
  langName: "French",
  skills: [
    {
      id: "fr-basics",
      title: "Basics",
      icon: "🧱",
      words: [
        { es: "l'homme", en: "the man" },
        { es: "la femme", en: "the woman" },
        { es: "le garçon", en: "the boy" },
        { es: "la fille", en: "the girl" },
        { es: "je", en: "I" },
        { es: "tu", en: "you" },
        { es: "oui", en: "yes" },
        { es: "non", en: "no" }
      ],
      sentences: [
        { es: "je suis une femme", en: "I am a woman" },
        { es: "il est un garçon", en: "he is a boy" },
        { es: "tu es un homme", en: "you are a man" },
        { es: "elle est une fille", en: "she is a girl" }
      ]
    },
    {
      id: "fr-greetings",
      title: "Greetings",
      icon: "👋",
      words: [
        { es: "bonjour", en: "hello" },
        { es: "au revoir", en: "goodbye" },
        { es: "merci", en: "thank you" },
        { es: "s'il vous plaît", en: "please" },
        { es: "bonsoir", en: "good evening" },
        { es: "bonne nuit", en: "good night" },
        { es: "bien", en: "well" },
        { es: "très", en: "very" }
      ],
      sentences: [
        { es: "bonjour, ça va ?", en: "hello, how are you?" },
        { es: "merci et au revoir", en: "thank you and goodbye" },
        { es: "je vais très bien", en: "I am very well" },
        { es: "bonsoir et bonne nuit", en: "good evening and good night" }
      ]
    },
    {
      id: "fr-food",
      title: "Food",
      icon: "🥐",
      words: [
        { es: "la pomme", en: "the apple" },
        { es: "le pain", en: "the bread" },
        { es: "le lait", en: "the milk" },
        { es: "l'eau", en: "the water" },
        { es: "le café", en: "the coffee" },
        { es: "le riz", en: "the rice" },
        { es: "le fruit", en: "the fruit" },
        { es: "le fromage", en: "the cheese" }
      ],
      sentences: [
        { es: "je mange du pain", en: "I eat bread" },
        { es: "elle boit du lait", en: "she drinks milk" },
        { es: "le garçon mange une pomme", en: "the boy eats an apple" },
        { es: "nous buvons du café", en: "we drink coffee" }
      ]
    },
    {
      id: "fr-animals",
      title: "Animals",
      icon: "🐴",
      words: [
        { es: "le chien", en: "the dog" },
        { es: "le chat", en: "the cat" },
        { es: "le cheval", en: "the horse" },
        { es: "l'oiseau", en: "the bird" },
        { es: "le poisson", en: "the fish" },
        { es: "la vache", en: "the cow" },
        { es: "l'ours", en: "the bear" },
        { es: "la souris", en: "the mouse" }
      ],
      sentences: [
        { es: "le chat boit du lait", en: "the cat drinks milk" },
        { es: "le chien mange du pain", en: "the dog eats bread" },
        { es: "j'ai un cheval", en: "I have a horse" },
        { es: "la vache est grande", en: "the cow is big" }
      ]
    },
    {
      id: "fr-family",
      title: "Family",
      icon: "👪",
      words: [
        { es: "la mère", en: "the mother" },
        { es: "le père", en: "the father" },
        { es: "le frère", en: "the brother" },
        { es: "la sœur", en: "the sister" },
        { es: "la grand-mère", en: "the grandmother" },
        { es: "le grand-père", en: "the grandfather" },
        { es: "le fils", en: "the son" },
        { es: "la tante", en: "the aunt" }
      ],
      sentences: [
        { es: "il est mon frère", en: "he is my brother" },
        { es: "mon père boit du café", en: "my father drinks coffee" },
        { es: "la grand-mère mange du pain", en: "the grandmother eats bread" },
        { es: "ma mère est médecin", en: "my mother is a doctor" }
      ]
    },
    {
      id: "fr-colors",
      title: "Colors",
      icon: "🎨",
      words: [
        { es: "rouge", en: "red" },
        { es: "bleu", en: "blue" },
        { es: "vert", en: "green" },
        { es: "jaune", en: "yellow" },
        { es: "noir", en: "black" },
        { es: "blanc", en: "white" },
        { es: "rose", en: "pink" },
        { es: "marron", en: "brown" }
      ],
      sentences: [
        { es: "le chat est noir", en: "the cat is black" },
        { es: "la pomme est rouge", en: "the apple is red" },
        { es: "mon cheval est blanc", en: "my horse is white" },
        { es: "l'oiseau est bleu", en: "the bird is blue" }
      ]
    },
    {
      id: "fr-numbers",
      title: "Numbers",
      icon: "🔢",
      words: [
        { es: "un", en: "one" },
        { es: "deux", en: "two" },
        { es: "trois", en: "three" },
        { es: "quatre", en: "four" },
        { es: "cinq", en: "five" },
        { es: "six", en: "six" },
        { es: "sept", en: "seven" },
        { es: "huit", en: "eight" }
      ],
      sentences: [
        { es: "j'ai deux chats", en: "I have two cats" },
        { es: "elle a trois frères", en: "she has three brothers" },
        { es: "quatre pommes rouges", en: "four red apples" },
        { es: "cinq grands chiens", en: "five big dogs" }
      ]
    },
    {
      id: "fr-phrases",
      title: "Phrases",
      icon: "💬",
      words: [
        { es: "de rien", en: "you are welcome" },
        { es: "je suis désolé", en: "I am sorry" },
        { es: "je ne sais pas", en: "I do not know" },
        { es: "peut-être", en: "maybe" },
        { es: "à bientôt", en: "see you soon" },
        { es: "bienvenue", en: "welcome" },
        { es: "enchanté", en: "nice to meet you" },
        { es: "bien sûr", en: "of course" }
      ],
      sentences: [
        { es: "je suis désolé, je ne sais pas", en: "I am sorry, I do not know" },
        { es: "à bientôt, mon frère", en: "see you soon, my brother" },
        { es: "bienvenue chez moi", en: "welcome to my house" },
        { es: "enchanté, je suis Ana", en: "nice to meet you, I am Ana" }
      ]
    }
  ]
};

const COURSES = [SPANISH, FRENCH];
const COURSE = SPANISH; // default course (back-compat alias)

const STUDENT_AVATARS = ["🦊", "🐼", "🐯", "🐨", "🐸", "🦁", "🐙", "🦄", "🐢", "🐝", "🦉", "🐬"];
