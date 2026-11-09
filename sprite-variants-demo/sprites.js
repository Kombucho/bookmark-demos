// Paths into the PokeAPI sprites repo. The pictures are static files.
// Folder order is back, then shiny, then female, matching the repo:
//   sprites/pokemon/25.png
//   sprites/pokemon/back/shiny/female/25.png
//   sprites/pokemon/female/25.png
//   sprites/pokemon/other/dream-world/25.svg
//   sprites/pokemon/other/official-artwork/shiny/25.png
//   sprites/pokemon/other/showdown/back/shiny/female/25.gif
// Numbered files in that repo run from 1 through 1025.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SpriteVariants = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MAX_ID = 1025;
  const RAW_ROOT = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/';
  const NAME_LIST = ["bulbasaur", "ivysaur", "venusaur", "charmander", "charmeleon", "charizard", "squirtle", "wartortle", "blastoise", "caterpie", "metapod", "butterfree", "weedle", "kakuna", "beedrill", "pidgey", "pidgeotto", "pidgeot", "rattata", "raticate", "spearow", "fearow", "ekans", "arbok", "pikachu", "raichu", "sandshrew", "sandslash", "nidoran-f", "nidorina", "nidoqueen", "nidoran-m", "nidorino", "nidoking", "clefairy", "clefable", "vulpix", "ninetales", "jigglypuff", "wigglytuff", "zubat", "golbat", "oddish", "gloom", "vileplume", "paras", "parasect", "venonat", "venomoth", "diglett", "dugtrio", "meowth", "persian", "psyduck", "golduck", "mankey", "primeape", "growlithe", "arcanine", "poliwag", "poliwhirl", "poliwrath", "abra", "kadabra", "alakazam", "machop", "machoke", "machamp", "bellsprout", "weepinbell", "victreebel", "tentacool", "tentacruel", "geodude", "graveler", "golem", "ponyta", "rapidash", "slowpoke", "slowbro", "magnemite", "magneton", "farfetchd", "doduo", "dodrio", "seel", "dewgong", "grimer", "muk", "shellder", "cloyster", "gastly", "haunter", "gengar", "onix", "drowzee", "hypno", "krabby", "kingler", "voltorb", "electrode", "exeggcute", "exeggutor", "cubone", "marowak", "hitmonlee", "hitmonchan", "lickitung", "koffing", "weezing", "rhyhorn", "rhydon", "chansey", "tangela", "kangaskhan", "horsea", "seadra", "goldeen", "seaking", "staryu", "starmie", "mr-mime", "scyther", "jynx", "electabuzz", "magmar", "pinsir", "tauros", "magikarp", "gyarados", "lapras", "ditto", "eevee", "vaporeon", "jolteon", "flareon", "porygon", "omanyte", "omastar", "kabuto", "kabutops", "aerodactyl", "snorlax", "articuno", "zapdos", "moltres", "dratini", "dragonair", "dragonite", "mewtwo", "mew", "chikorita", "bayleef", "meganium", "cyndaquil", "quilava", "typhlosion", "totodile", "croconaw", "feraligatr", "sentret", "furret", "hoothoot", "noctowl", "ledyba", "ledian", "spinarak", "ariados", "crobat", "chinchou", "lanturn", "pichu", "cleffa", "igglybuff", "togepi", "togetic", "natu", "xatu", "mareep", "flaaffy", "ampharos", "bellossom", "marill", "azumarill", "sudowoodo", "politoed", "hoppip", "skiploom", "jumpluff", "aipom", "sunkern", "sunflora", "yanma", "wooper", "quagsire", "espeon", "umbreon", "murkrow", "slowking", "misdreavus", "unown", "wobbuffet", "girafarig", "pineco", "forretress", "dunsparce", "gligar", "steelix", "snubbull", "granbull", "qwilfish", "scizor", "shuckle", "heracross", "sneasel", "teddiursa", "ursaring", "slugma", "magcargo", "swinub", "piloswine", "corsola", "remoraid", "octillery", "delibird", "mantine", "skarmory", "houndour", "houndoom", "kingdra", "phanpy", "donphan", "porygon2", "stantler", "smeargle", "tyrogue", "hitmontop", "smoochum", "elekid", "magby", "miltank", "blissey", "raikou", "entei", "suicune", "larvitar", "pupitar", "tyranitar", "lugia", "ho-oh", "celebi", "treecko", "grovyle", "sceptile", "torchic", "combusken", "blaziken", "mudkip", "marshtomp", "swampert", "poochyena", "mightyena", "zigzagoon", "linoone", "wurmple", "silcoon", "beautifly", "cascoon", "dustox", "lotad", "lombre", "ludicolo", "seedot", "nuzleaf", "shiftry", "taillow", "swellow", "wingull", "pelipper", "ralts", "kirlia", "gardevoir", "surskit", "masquerain", "shroomish", "breloom", "slakoth", "vigoroth", "slaking", "nincada", "ninjask", "shedinja", "whismur", "loudred", "exploud", "makuhita", "hariyama", "azurill", "nosepass", "skitty", "delcatty", "sableye", "mawile", "aron", "lairon", "aggron", "meditite", "medicham", "electrike", "manectric", "plusle", "minun", "volbeat", "illumise", "roselia", "gulpin", "swalot", "carvanha", "sharpedo", "wailmer", "wailord", "numel", "camerupt", "torkoal", "spoink", "grumpig", "spinda", "trapinch", "vibrava", "flygon", "cacnea", "cacturne", "swablu", "altaria", "zangoose", "seviper", "lunatone", "solrock", "barboach", "whiscash", "corphish", "crawdaunt", "baltoy", "claydol", "lileep", "cradily", "anorith", "armaldo", "feebas", "milotic", "castform", "kecleon", "shuppet", "banette", "duskull", "dusclops", "tropius", "chimecho", "absol", "wynaut", "snorunt", "glalie", "spheal", "sealeo", "walrein", "clamperl", "huntail", "gorebyss", "relicanth", "luvdisc", "bagon", "shelgon", "salamence", "beldum", "metang", "metagross", "regirock", "regice", "registeel", "latias", "latios", "kyogre", "groudon", "rayquaza", "jirachi", "deoxys-normal", "turtwig", "grotle", "torterra", "chimchar", "monferno", "infernape", "piplup", "prinplup", "empoleon", "starly", "staravia", "staraptor", "bidoof", "bibarel", "kricketot", "kricketune", "shinx", "luxio", "luxray", "budew", "roserade", "cranidos", "rampardos", "shieldon", "bastiodon", "burmy", "wormadam-plant", "mothim", "combee", "vespiquen", "pachirisu", "buizel", "floatzel", "cherubi", "cherrim", "shellos", "gastrodon", "ambipom", "drifloon", "drifblim", "buneary", "lopunny", "mismagius", "honchkrow", "glameow", "purugly", "chingling", "stunky", "skuntank", "bronzor", "bronzong", "bonsly", "mime-jr", "happiny", "chatot", "spiritomb", "gible", "gabite", "garchomp", "munchlax", "riolu", "lucario", "hippopotas", "hippowdon", "skorupi", "drapion", "croagunk", "toxicroak", "carnivine", "finneon", "lumineon", "mantyke", "snover", "abomasnow", "weavile", "magnezone", "lickilicky", "rhyperior", "tangrowth", "electivire", "magmortar", "togekiss", "yanmega", "leafeon", "glaceon", "gliscor", "mamoswine", "porygon-z", "gallade", "probopass", "dusknoir", "froslass", "rotom", "uxie", "mesprit", "azelf", "dialga", "palkia", "heatran", "regigigas", "giratina-altered", "cresselia", "phione", "manaphy", "darkrai", "shaymin-land", "arceus", "victini", "snivy", "servine", "serperior", "tepig", "pignite", "emboar", "oshawott", "dewott", "samurott", "patrat", "watchog", "lillipup", "herdier", "stoutland", "purrloin", "liepard", "pansage", "simisage", "pansear", "simisear", "panpour", "simipour", "munna", "musharna", "pidove", "tranquill", "unfezant", "blitzle", "zebstrika", "roggenrola", "boldore", "gigalith", "woobat", "swoobat", "drilbur", "excadrill", "audino", "timburr", "gurdurr", "conkeldurr", "tympole", "palpitoad", "seismitoad", "throh", "sawk", "sewaddle", "swadloon", "leavanny", "venipede", "whirlipede", "scolipede", "cottonee", "whimsicott", "petilil", "lilligant", "basculin-red-striped", "sandile", "krokorok", "krookodile", "darumaka", "darmanitan-standard", "maractus", "dwebble", "crustle", "scraggy", "scrafty", "sigilyph", "yamask", "cofagrigus", "tirtouga", "carracosta", "archen", "archeops", "trubbish", "garbodor", "zorua", "zoroark", "minccino", "cinccino", "gothita", "gothorita", "gothitelle", "solosis", "duosion", "reuniclus", "ducklett", "swanna", "vanillite", "vanillish", "vanilluxe", "deerling", "sawsbuck", "emolga", "karrablast", "escavalier", "foongus", "amoonguss", "frillish-male", "jellicent-male", "alomomola", "joltik", "galvantula", "ferroseed", "ferrothorn", "klink", "klang", "klinklang", "tynamo", "eelektrik", "eelektross", "elgyem", "beheeyem", "litwick", "lampent", "chandelure", "axew", "fraxure", "haxorus", "cubchoo", "beartic", "cryogonal", "shelmet", "accelgor", "stunfisk", "mienfoo", "mienshao", "druddigon", "golett", "golurk", "pawniard", "bisharp", "bouffalant", "rufflet", "braviary", "vullaby", "mandibuzz", "heatmor", "durant", "deino", "zweilous", "hydreigon", "larvesta", "volcarona", "cobalion", "terrakion", "virizion", "tornadus-incarnate", "thundurus-incarnate", "reshiram", "zekrom", "landorus-incarnate", "kyurem", "keldeo-ordinary", "meloetta-aria", "genesect", "chespin", "quilladin", "chesnaught", "fennekin", "braixen", "delphox", "froakie", "frogadier", "greninja", "bunnelby", "diggersby", "fletchling", "fletchinder", "talonflame", "scatterbug", "spewpa", "vivillon", "litleo", "pyroar-male", "flabebe", "floette", "florges", "skiddo", "gogoat", "pancham", "pangoro", "furfrou", "espurr", "meowstic-male", "honedge", "doublade", "aegislash-shield", "spritzee", "aromatisse", "swirlix", "slurpuff", "inkay", "malamar", "binacle", "barbaracle", "skrelp", "dragalge", "clauncher", "clawitzer", "helioptile", "heliolisk", "tyrunt", "tyrantrum", "amaura", "aurorus", "sylveon", "hawlucha", "dedenne", "carbink", "goomy", "sliggoo", "goodra", "klefki", "phantump", "trevenant", "pumpkaboo-average", "gourgeist-average", "bergmite", "avalugg", "noibat", "noivern", "xerneas", "yveltal", "zygarde-50", "diancie", "hoopa", "volcanion", "rowlet", "dartrix", "decidueye", "litten", "torracat", "incineroar", "popplio", "brionne", "primarina", "pikipek", "trumbeak", "toucannon", "yungoos", "gumshoos", "grubbin", "charjabug", "vikavolt", "crabrawler", "crabominable", "oricorio-baile", "cutiefly", "ribombee", "rockruff", "lycanroc-midday", "wishiwashi-solo", "mareanie", "toxapex", "mudbray", "mudsdale", "dewpider", "araquanid", "fomantis", "lurantis", "morelull", "shiinotic", "salandit", "salazzle", "stufful", "bewear", "bounsweet", "steenee", "tsareena", "comfey", "oranguru", "passimian", "wimpod", "golisopod", "sandygast", "palossand", "pyukumuku", "type-null", "silvally", "minior-red-meteor", "komala", "turtonator", "togedemaru", "mimikyu-disguised", "bruxish", "drampa", "dhelmise", "jangmo-o", "hakamo-o", "kommo-o", "tapu-koko", "tapu-lele", "tapu-bulu", "tapu-fini", "cosmog", "cosmoem", "solgaleo", "lunala", "nihilego", "buzzwole", "pheromosa", "xurkitree", "celesteela", "kartana", "guzzlord", "necrozma", "magearna", "marshadow", "poipole", "naganadel", "stakataka", "blacephalon", "zeraora", "meltan", "melmetal", "grookey", "thwackey", "rillaboom", "scorbunny", "raboot", "cinderace", "sobble", "drizzile", "inteleon", "skwovet", "greedent", "rookidee", "corvisquire", "corviknight", "blipbug", "dottler", "orbeetle", "nickit", "thievul", "gossifleur", "eldegoss", "wooloo", "dubwool", "chewtle", "drednaw", "yamper", "boltund", "rolycoly", "carkol", "coalossal", "applin", "flapple", "appletun", "silicobra", "sandaconda", "cramorant", "arrokuda", "barraskewda", "toxel", "toxtricity-amped", "sizzlipede", "centiskorch", "clobbopus", "grapploct", "sinistea", "polteageist", "hatenna", "hattrem", "hatterene", "impidimp", "morgrem", "grimmsnarl", "obstagoon", "perrserker", "cursola", "sirfetchd", "mr-rime", "runerigus", "milcery", "alcremie", "falinks", "pincurchin", "snom", "frosmoth", "stonjourner", "eiscue-ice", "indeedee-male", "morpeko-full-belly", "cufant", "copperajah", "dracozolt", "arctozolt", "dracovish", "arctovish", "duraludon", "dreepy", "drakloak", "dragapult", "zacian", "zamazenta", "eternatus", "kubfu", "urshifu-single-strike", "zarude", "regieleki", "regidrago", "glastrier", "spectrier", "calyrex", "wyrdeer", "kleavor", "ursaluna", "basculegion-male", "sneasler", "overqwil", "enamorus-incarnate", "sprigatito", "floragato", "meowscarada", "fuecoco", "crocalor", "skeledirge", "quaxly", "quaxwell", "quaquaval", "lechonk", "oinkologne-male", "tarountula", "spidops", "nymble", "lokix", "pawmi", "pawmo", "pawmot", "tandemaus", "maushold-family-of-four", "fidough", "dachsbun", "smoliv", "dolliv", "arboliva", "squawkabilly-green-plumage", "nacli", "naclstack", "garganacl", "charcadet", "armarouge", "ceruledge", "tadbulb", "bellibolt", "wattrel", "kilowattrel", "maschiff", "mabosstiff", "shroodle", "grafaiai", "bramblin", "brambleghast", "toedscool", "toedscruel", "klawf", "capsakid", "scovillain", "rellor", "rabsca", "flittle", "espathra", "tinkatink", "tinkatuff", "tinkaton", "wiglett", "wugtrio", "bombirdier", "finizen", "palafin-zero", "varoom", "revavroom", "cyclizar", "orthworm", "glimmet", "glimmora", "greavard", "houndstone", "flamigo", "cetoddle", "cetitan", "veluza", "dondozo", "tatsugiri-curly", "annihilape", "clodsire", "farigiraf", "dudunsparce-two-segment", "kingambit", "great-tusk", "scream-tail", "brute-bonnet", "flutter-mane", "slither-wing", "sandy-shocks", "iron-treads", "iron-bundle", "iron-hands", "iron-jugulis", "iron-moth", "iron-thorns", "frigibax", "arctibax", "baxcalibur", "gimmighoul", "gholdengo", "wo-chien", "chien-pao", "ting-lu", "chi-yu", "roaring-moon", "iron-valiant", "koraidon", "miraidon", "walking-wake", "iron-leaves", "dipplin", "poltchageist", "sinistcha", "okidogi", "munkidori", "fezandipiti", "ogerpon", "archaludon", "hydrapple", "gouging-fire", "raging-bolt", "iron-boulder", "iron-crown", "terapagos", "pecharunt"];

  const TITLES = {
    'nidoran-f': 'Nidoran ♀',
    'nidoran-m': 'Nidoran ♂',
    'farfetchd': "Farfetch'd",
    'sirfetchd': "Sirfetch'd",
    'mr-mime': 'Mr. Mime',
    'mime-jr': 'Mime Jr.',
    'mr-rime': 'Mr. Rime',
    'ho-oh': 'Ho-Oh',
    'type-null': 'Type: Null',
    'flabebe': 'Flabébé',
    'jangmo-o': 'Jangmo-o',
    'hakamo-o': 'Hakamo-o',
    'kommo-o': 'Kommo-o',
    'porygon-z': 'Porygon-Z',
    'wo-chien': 'Wo-Chien',
    'chien-pao': 'Chien-Pao',
    'ting-lu': 'Ting-Lu',
    'chi-yu': 'Chi-Yu',
  };

  const STYLES = [
    {
      id: 'pixel',
      label: 'Pixel',
      ext: 'png',
      dir: '',
      pixelated: true,
      blurb: 'Default PNGs. back, shiny, and female are folders, and they nest.',
    },
    {
      id: 'dream',
      label: 'Dream World',
      ext: 'svg',
      dir: 'other/dream-world',
      pixelated: false,
      blurb: 'One SVG per number. There is no back, shiny, or female folder, so those paths have no file.',
    },
    {
      id: 'official',
      label: 'Official art',
      ext: 'png',
      dir: 'other/official-artwork',
      pixelated: false,
      blurb: 'A front PNG, plus shiny. No back folder and no female folder.',
    },
    {
      id: 'showdown',
      label: 'Showdown',
      ext: 'gif',
      dir: 'other/showdown',
      pixelated: true,
      blurb: 'Animated GIFs. The same back, shiny, and female folders, where a file was drawn.',
    },
  ];

  const AXES = [
    { back: false, shiny: false, female: false, label: 'Front' },
    { back: false, shiny: true, female: false, label: 'Front shiny' },
    { back: false, shiny: false, female: true, label: 'Front female' },
    { back: false, shiny: true, female: true, label: 'Front shiny female' },
    { back: true, shiny: false, female: false, label: 'Back' },
    { back: true, shiny: true, female: false, label: 'Back shiny' },
    { back: true, shiny: false, female: true, label: 'Back female' },
    { back: true, shiny: true, female: true, label: 'Back shiny female' },
  ];

  function clampId(value) {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < 1) return 1;
    if (n > MAX_ID) return MAX_ID;
    return n;
  }

  function styleOf(id) {
    for (let i = 0; i < STYLES.length; i++) {
      if (STYLES[i].id === id) return STYLES[i];
    }
    return STYLES[0];
  }

  function titleOf(slug) {
    if (!slug) return '';
    if (TITLES[slug]) return TITLES[slug];
    return String(slug).split('-').map(function (word) {
      if (!word) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
  }

  function nameOf(id) {
    return titleOf(NAME_LIST[clampId(id) - 1] || '');
  }

  function relativePath(styleId, id, flags) {
    const style = styleOf(styleId);
    const n = clampId(id);
    const f = flags || {};
    const parts = ['sprites', 'pokemon'];
    if (style.dir) parts.push.apply(parts, style.dir.split('/'));
    if (f.back) parts.push('back');
    if (f.shiny) parts.push('shiny');
    if (f.female) parts.push('female');
    parts.push(String(n) + '.' + style.ext);
    return parts.join('/');
  }

  function rawUrl(relative) {
    return RAW_ROOT + relative;
  }

  function matrix(styleId, id) {
    const style = styleOf(styleId);
    return AXES.map(function (axis) {
      const path = relativePath(style.id, id, axis);
      return {
        label: axis.label,
        back: axis.back,
        shiny: axis.shiny,
        female: axis.female,
        path: path,
        url: rawUrl(path),
        pixelated: style.pixelated,
      };
    });
  }

  return {
    MAX_ID: MAX_ID,
    RAW_ROOT: RAW_ROOT,
    NAME_LIST: NAME_LIST,
    STYLES: STYLES,
    AXES: AXES,
    clampId: clampId,
    styleOf: styleOf,
    titleOf: titleOf,
    nameOf: nameOf,
    relativePath: relativePath,
    rawUrl: rawUrl,
    matrix: matrix,
  };
});
