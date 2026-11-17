"""Make the rough English word list for the fc10 gloss vocabulary (packages/fc10-runtime/src/gloss-en.json).

    python ml/export/make_gloss_en.py --vocab <HandsUp-models>/fc10/fc10_vocab.json --out packages/fc10-runtime/src/gloss-en.json

Word by word only, for orientation; NOT a translation. Written by hand for Hands Up (2026-11-17).
Rules: "loc-X" (a sign placed on the map) -> X; "X-PLUSPLUS" (repeated) -> X; "NICHT-X" / "NICHTALP-X"
-> "not X"; "poss-X" / "qu-X" / "cl-X" / "lh-X" -> X. Glosses with no entry are written as null and the
page shows them as unknown. Special tokens (__ON__, __OFF__, ...) map to "" (hidden).
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

HIDDEN = {"<blank>", "<unk>", "__ON__", "__OFF__", "__EMOTION__", "__LEFTHAND__", "__PU__"}

W = {
    # numbers
    "NULL": "zero", "EINS": "one", "EIN": "one", "EINE": "one", "ZWEI": "two", "DREI": "three", "VIER": "four", "FUENF": "five",
    "SECHS": "six", "SIEBEN": "seven", "ACHT": "eight", "NEUN": "nine", "ZEHN": "ten", "ELF": "eleven", "ZWOELF": "twelve",
    "DREIZEHN": "thirteen", "VIERZEHN": "fourteen", "FUENFZEHN": "fifteen", "SECHSZEHN": "sixteen", "SIEBZEHN": "seventeen",
    "SIEBENZEHN": "seventeen", "ACHTZEHN": "eighteen", "NEUNZEHN": "nineteen", "ZWANZIG": "twenty", "DREISSIG": "thirty",
    "VIERZIG": "forty", "FUENFZIG": "fifty", "SIEBZIG": "seventy", "ACHTZIG": "eighty", "NEUNZIG": "ninety", "HUNDERT": "hundred",
    "EINHUNDERT": "one hundred", "DREIHUNDERT": "three hundred", "VIERHUNDERT": "four hundred", "FUENFHUNDERT": "five hundred",
    "SECHSHUNDERT": "six hundred", "SIEBENHUNDERT": "seven hundred", "ACHTHUNDERT": "eight hundred", "NEUNHUNDERT": "nine hundred",
    "TAUSEND": "thousand", "ZWEIZWANZIG": "twenty two", "ZWEIDREISSIG": "thirty two", "DREIDREISSIG": "thirty three",
    "ERSTE": "first", "ZWEITE": "second", "DRITTE": "third", "VIERTE": "fourth", "FUENFTE": "fifth", "SECHSTE": "sixth",
    "SIEBTE": "seventh", "ACHTE": "eighth", "NEUNTE": "ninth", "ZEHNTE": "tenth", "ELFTE": "eleventh", "ZWOELFTE": "twelfth",
    "NEUNZEHNTE": "nineteenth", "MINUS": "minus", "PLUS": "plus", "GRAD": "degrees", "PROZENT": "percent", "HALB": "half",
    "HAELFTE": "half", "KOMMA": "point", "ZAHL": "number", "NUMMER": "number", "DREIMAL": "three times", "MEHRMALS": "several times",
    # days, months, time
    "MONTAG": "Monday", "DIENSTAG": "Tuesday", "MITTWOCH": "Wednesday", "DONNERSTAG": "Thursday", "FREITAG": "Friday",
    "SAMSTAG": "Saturday", "SONNTAG": "Sunday", "JANUAR": "January", "FEBRUAR": "February", "MAERZ": "March", "APRIL": "April",
    "MAI": "May", "JUNI": "June", "JULI": "July", "AUGUST": "August", "SEPTEMBER": "September", "OKTOBER": "October",
    "NOVEMBER": "November", "DEZEMBER": "December", "HEUTE": "today", "MORGEN": "tomorrow", "GESTERN": "yesterday",
    "UEBERMORGEN": "day after tomorrow", "JETZT": "now", "ABEND": "evening", "NACHT": "night", "TAG": "day", "TAGE": "days",
    "MITTAG": "noon", "NACHMITTAG": "afternoon", "VORMITTAG": "morning", "MORGENS": "in the morning", "MORGEN-FRUEH": "tomorrow morning",
    "FRUEH": "early", "SPAET": "late", "SPAETER": "later", "WOCHE": "week", "WOCHENENDE": "weekend", "JAHR": "year",
    "STUNDE": "hour", "UHR": "o'clock", "ZEIT": "time", "MOMENT": "moment", "IM-MOMENT": "at the moment", "HEUTE-NACHT": "tonight",
    "HEUTE-ABEND": "this evening", "HEUTE-MITTAG": "today at noon", "TAGSUEBER": "during the day", "AM-TAG": "during the day",
    "GANZTAGS": "all day", "NAECHSTE-WOCHE": "next week", "DIESE-WOCHE": "this week", "IN-DIESE-WOCHE": "this week",
    "LETZTE-WOCHE": "last week", "EIN-WOCHE": "one week", "ZWEI-TAG": "two days", "FUENF-TAGE": "five days", "PAAR-TAG": "a few days",
    "IN-PAAR-TAG": "in a few days", "IN-PAAR-TAGE-SPAETER": "a few days later", "IN-KOMMEND-TAG": "in the coming days",
    "IN-KOMMEND-ZEIT": "in the coming time", "WINTER": "winter", "SOMMER": "summer", "HERBST": "autumn", "FRUEHLING": "spring",
    "OSTERN": "Easter", "PFINGSTEN": "Pentecost", "WEIHNACHTEN": "Christmas", "WEIHNACHT": "Christmas", "KARFREITAG": "Good Friday",
    "BIS-MORGEN": "until tomorrow", "BIS-JETZT": "until now", "BIS-MITTE": "until the middle", "AB-JETZT": "from now on",
    "IM-VERLAUF": "later on", "IM-LAUFE": "in the course of", "ANFANG": "beginning", "BEGINN": "beginning", "ENDE": "end",
    "MITTE": "middle", "ZU-ENDE": "over", "SCHLUSS": "end", "FUENF-UHR": "five o'clock", "DREI-MONATE": "three months",
    "EIN-JAHR": "one year", "SIEBEN-WOCHE": "seven weeks", "RUND-UM-DIE-UHR": "around the clock", "VOR-LETZTEN-TAGEN": "in the last days",
    "IN-KUERZE": "shortly", "BALD": "soon", "DEMNAECHST": "soon", "IRGENDWANN": "sometime", "WANN": "when",
    # weather
    "WETTER": "weather", "REGEN": "rain", "SCHNEE": "snow", "SCHNEIEN": "snowing", "SONNE": "sun", "S0NNE": "sun", "WOLKE": "cloud",
    "WIND": "wind", "STURM": "storm", "GEWITTER": "thunderstorm", "NEBEL": "fog", "FROST": "frost", "EIS": "ice", "GLATT": "slippery",
    "GLATTEIS": "black ice", "HAGEL": "hail", "GRAUPEL": "sleet", "SCHAUER": "showers", "NIESELREGEN": "drizzle", "TROPFEN": "drops",
    "FLOCKEN": "flakes", "BLITZ": "lightning", "DONNER": "thunder", "ORKAN": "hurricane", "WIRBELSTURM": "cyclone", "BOEE": "gust",
    "UNWETTER": "severe weather", "WARNUNG": "warning", "GEFAHR": "danger", "TEMPERATUR": "temperature", "WARM": "warm",
    "KALT": "cold", "KUEHL": "cool", "KUEHLER": "cooler", "HEISS": "hot", "MILD": "mild", "FRISCH": "fresh (cool)", "SCHWUEL": "humid",
    "FEUCHT": "damp", "NASS": "wet", "TROCKEN": "dry", "KLAR": "clear", "TRUEB": "dull (overcast)", "BEWOELKT": "cloudy",
    "BEDECKT": "overcast", "HELL": "bright", "HIMMEL": "sky", "BLAU": "blue", "FREUNDLICH": "friendly (fair)", "SCHOEN": "nice",
    "WECHSELHAFT": "changeable", "UEBERWIEGEND": "mostly", "MEISTENS": "mostly", "HAUPTSAECHLICH": "mainly", "HOCH": "high (pressure)",
    "TIEF": "low (pressure)", "DRUCK": "pressure", "DRUCKFLAECHE": "pressure area", "LUFT": "air", "KALTFRONT": "cold front",
    "FRONT": "front", "AUFLOCKERUNG": "breaking clouds", "AUFHEITERN": "brighten up", "AUFKLAREN": "clear up", "AUFLOESEN": "dissolve",
    "AUFZIEHEN": "move in", "SCHEINEN": "shine", "WEHEN": "blow", "TAU": "dew", "TAUEN": "thaw", "SCHMELZEN": "melt",
    "GEFRIEREN": "freeze", "REIF": "frost (rime)", "DUNST": "haze", "FOEHN": "foehn wind", "HOCHWASSER": "flood", "FLUT": "flood",
    "UEBERSCHWEMMUNG": "flooding", "UEBERFLUTUNG": "flooding", "WASSER-STEIGEN": "water rising", "SONNENUNTERGANG": "sunset",
    "STERN": "star", "MOND": "moon", "TROPISCH": "tropical", "SCHWACH": "weak", "MAESSIG": "moderate", "STARK": "strong",
    "KRAEFTIG": "strong", "HEFTIG": "heavy", "LEICHT": "light", "DICHT": "dense", "LOCKER": "loose", "STABIL": "stable",
    "UNBESTAENDIG": "unsettled", "REGEN-AUF-ALPEN": "rain on the Alps", "VORAUSSAGE": "forecast", "VORAUS": "ahead",
    "WIE-AUSSEHEN": "how it looks", "AUSSEHEN": "look", "ZENTIMETER": "centimetres", "METER": "metres", "KILOMETER": "kilometres",
    "LITER": "litres", "QUADRATMETER": "square metre", "PRO": "per", "MM": "mm", "ERDRUTSCH": "landslide", "BRAND": "fire",
    "MATSCH": "slush", "STROM": "current", "STROEMEN": "flow", "WIRBEL": "swirl", "ZONE": "zone", "STREIFEN": "strip",
    # places and directions
    "NORD": "north", "SUED": "south", "OST": "east", "WEST": "west", "NORDOST": "northeast", "NORDWEST": "northwest",
    "SUEDOST": "southeast", "SUEDWEST": "southwest", "NORDRAUM": "the north", "SUEDRAUM": "the south", "OSTRAUM": "the east",
    "WESTRAUM": "the west", "NORDOSTRAUM": "the northeast", "NORDWESTRAUM": "the northwest", "SUEDOSTRAUM": "the southeast",
    "SUEDWESTRAUM": "the southwest", "DEUTSCHLANDRAUM": "Germany", "REGION": "region", "RAUM": "area", "BEREICH": "area",
    "GEBIET": "area", "LAND": "land", "DEUTSCHLAND": "Germany", "DEUTSCH": "German", "KUESTE": "coast", "AM-KUESTE": "at the coast",
    "MEER": "sea", "AM-MEER": "at the sea", "SEE": "lake", "NORDSEE": "North Sea", "BODENSEE": "Lake Constance", "FLUSS": "river",
    "BERG": "mountain", "GEBIRGE": "mountains", "MITTEGEBIRGE": "low mountains", "ALPEN": "Alps", "ALPENRAND": "edge of the Alps",
    "ALPENTAL": "Alpine valley", "TAL": "valley", "GIPFEL": "summit", "INSEL": "island", "WALD": "forest", "FELD": "field",
    "WIESE": "meadow", "NIEDERUNG": "lowland", "HOEHE": "height", "OBEN": "up", "UNTEN": "down", "BERGAB": "downhill",
    "BERGAUF": "uphill", "GRENZE": "border", "RAND": "edge", "AM-RAND": "at the edge", "ZENTRUM": "centre", "STADT": "city",
    "ORT": "place", "HIER": "here", "DA": "there", "UEBERALL": "everywhere", "RICHTUNG": "direction", "WEIT": "far", "NAH": "near",
    "NAEHE": "near", "ENTFERNT": "far away", "ATLANTIK": "Atlantic", "EUROPA": "Europe", "AFRIKA": "Africa", "AMERIKA": "America",
    "NORDPOL": "North Pole", "SKANDINAVIEN": "Scandinavia", "BAYERN": "Bavaria", "NIEDERSACHSEN": "Lower Saxony", "HESSEN": "Hesse",
    "SACHSEN": "Saxony", "THUERINGEN": "Thuringia", "SAARLAND": "Saarland", "BRANDENBURG": "Brandenburg", "BERLIN": "Berlin",
    "HAMBURG": "Hamburg", "BREMEN": "Bremen", "MUENCHEN": "Munich", "KOELN": "Cologne", "STUTTGART": "Stuttgart", "DRESDEN": "Dresden",
    "LEIPZIG": "Leipzig", "ERFURT": "Erfurt", "KIEL": "Kiel", "ROSTOCK": "Rostock", "HANNOVER": "Hanover", "FRANKFURT": "Frankfurt",
    "DUESSELDORF": "Duesseldorf", "AACHEN": "Aachen", "KOBLENZ": "Koblenz", "MAINZ": "Mainz", "MUENSTER": "Muenster",
    "ALLGAEU": "Allgaeu", "EIFEL": "Eifel", "RUEGEN": "Ruegen", "SYLT": "Sylt", "LAUSITZ": "Lusatia", "RUHRGEBIET": "Ruhr area",
    "RHEIN": "Rhine", "WESER": "Weser", "PFALZ": "Palatinate", "RHEINLAND": "Rhineland", "RHEINLAND-PFALZ": "Rhineland-Palatinate",
    "NORDRHEIN-WESTFALEN": "North Rhine-Westphalia", "NRW": "North Rhine-Westphalia", "NORDRHEIN": "North Rhine",
    "BADEN-WUERTTEMBERG": "Baden-Wuerttemberg", "WUERTTEMBERG": "Wuerttemberg", "MECKLENBURG-VORPOMMERN": "Mecklenburg-Western Pomerania",
    "MECKLENBURG": "Mecklenburg", "VORPOMMERN": "Western Pomerania", "POMMERN": "Pomerania", "SCHLESWIG": "Schleswig",
    "HOLSTEIN": "Holstein", "ANHALT": "Anhalt", "FRANKREICH": "France", "SPANIEN": "Spain", "PORTUGAL": "Portugal", "ITALIEN": "Italy",
    "GRIECHENLAND": "Greece", "TUERKEI": "Turkey", "POLEN": "Poland", "TSCHECHIEN": "Czechia", "OESTERREICH": "Austria",
    "UNGARN": "Hungary", "RUMAENIEN": "Romania", "KROATIEN": "Croatia", "RUSSLAND": "Russia", "MOSKAU": "Moscow", "BELGIEN": "Belgium",
    "HOLLAND": "Netherlands", "DAENEMARK": "Denmark", "NORWEGEN": "Norway", "SCHWEDEN": "Sweden", "FINNLAND": "Finland",
    "ISLAND": "Iceland", "IRLAND": "Ireland", "SCHOTTLAND": "Scotland", "ENGLAND": "England", "BRITANNIEN": "Britain",
    "GROSSBRITANNIEN": "Great Britain", "KANADA": "Canada", "KANAL": "Channel",
    # people and greetings
    "LIEB": "dear", "ZUSCHAUER": "viewers", "LEUTE": "people", "DAMEN": "ladies", "HERREN": "gentlemen", "ICH": "I", "DU": "you",
    "SIE": "you", "IHR": "you all", "WIR": "we", "EUCH": "you", "MEIN": "my", "SEIN": "his", "UNSER": "our", "BEI-UNS": "here with us",
    "FUER-UNS": "for us", "FUER-ALLE": "for everyone", "HALLO": "hello", "TSCHUESS": "bye", "ABSCHIED": "goodbye", "BEGRUESSEN": "greet",
    "GUT-ABEND": "good evening", "WUENSCHEN": "wish", "BITTE": "please", "DANKE": "thanks", "SEI-DANK": "thank", "GOTT": "God",
    "ENTSCHULDIGUNG": "sorry", "JA": "yes", "NEIN": "no", "IX": "(pointing)",
    # common words
    "UND": "and", "ODER": "or", "ABER": "but", "AUCH": "also", "DANN": "then", "DANACH": "after that", "UND-DANN": "and then",
    "BIS": "until", "AB": "from", "VON": "from", "NACH": "to", "MIT": "with", "OHNE": "without", "FUER": "for", "UEBER": "over",
    "UNTER": "under", "ZWISCHEN": "between", "DAZWISCHEN": "in between", "DURCH": "through", "IN": "in", "IM": "in the", "AM": "at the",
    "AN": "at", "AUF": "on", "ZU": "to", "UM": "around", "VOR": "before", "SEIT": "since", "WIE": "like", "SO": "so", "NOCH": "still",
    "SCHON": "already", "WIEDER": "again", "IMMER": "always", "OFT": "often", "MANCHMAL": "sometimes", "SELTEN": "rarely", "NIE": "never",
    "NUR": "only", "SEHR": "very", "VIEL": "much", "WENIG": "little", "WENIGER": "less", "MEHR": "more", "BISSCHEN": "a little",
    "EIN-BISSCHEN": "a little", "ETWAS": "something", "NICHTS": "nothing", "ALLE": "all", "GESAMT": "overall", "INSGESAMT": "overall",
    "TEIL": "part", "TEILWEISE": "partly", "STELLENWEISE": "in places", "VEREINZELT": "isolated", "EINZELN": "single", "DABEI": "with it",
    "DAZU": "in addition", "WEITER": "further", "NICHT": "not", "KEIN": "no", "KAUM": "hardly", "FAST": "almost", "GENUG": "enough",
    "UNGEFAEHR": "about", "MAXIMAL": "at most", "MINDESTENS": "at least", "BESONDERS": "especially", "SPEZIELL": "especially",
    "VIELLEICHT": "maybe", "WAHRSCHEINLICH": "probably", "WARSCHEINLICH": "probably", "MOEGLICH": "possible", "SICHER": "sure",
    "BESTIMMT": "certainly", "KOMMEN": "come", "GEHEN": "go", "BLEIBEN": "stay", "IN-KOMMEND": "coming", "WERDEN": "become",
    "HABEN": "have", "HABEN2": "have", "GEBEN": "give", "ES-GIBT": "there is", "MACHEN": "make", "SEHEN": "see", "SCHAUEN": "look",
    "ANSCHAUEN": "look at", "ZEIGEN": "show", "ZEIGEN-BILDSCHIRM": "show on screen", "SAGEN": "say", "MITTEILEN": "tell",
    "MITEILEN": "tell", "INFORMIEREN": "inform", "BEDEUTEN": "mean", "ES-BEDEUTET": "it means", "KOENNEN": "can", "KANN": "can",
    "MUESSEN": "must", "SOLL": "should", "MOEGEN": "like", "WISSEN": "know", "DENKEN": "think", "GLAUBEN": "believe", "HOFFEN": "hope",
    "WARTEN": "wait", "AUFPASSEN": "watch out", "VORSICHT": "caution", "ACHTUNG": "attention", "STEIGEN": "rise", "SINKEN": "fall",
    "FALLEN": "fall", "ABSINKEN": "drop", "ERHOEHEN": "increase", "VERRINGERN": "decrease", "REDUZIEREN": "reduce", "AENDERN": "change",
    "VERAENDERN": "change", "WECHSEL": "change", "ABWECHSELN": "alternate", "VERSCHWINDEN": "disappear", "VERBREITEN": "spread",
    "BEWEGEN": "move", "ZIEHEN": "move", "DREHEN": "turn", "BRINGEN": "bring", "ANKOMMEN": "arrive", "ZURUECK": "back", "WEG": "away",
    "VORBEI": "over (past)", "FERTIG": "done", "BEGINNEN": "begin", "AUFHOEREN": "stop", "PAUSE": "pause", "FUEHLEN": "feel",
    "SPUEREN": "feel", "FREUEN": "be glad", "GENIESSEN": "enjoy", "LEBEN": "live", "WOHNEN": "live", "FAHREN": "drive", "LAUFEN": "walk",
    "SPAZIEREN": "take a walk", "SPORT": "sports", "SKI": "ski", "RODELN": "sledging", "BADEN": "swim", "URLAUB": "holiday",
    "FREIZEIT": "free time", "VERKEHR": "traffic", "STAU": "traffic jam", "STRASSE": "road", "AUTO": "car", "ZUG": "train",
    "GUT": "good", "BESSER": "better", "SCHLECHT": "bad", "SCHLECHTER": "worse", "SCHLIMM": "bad", "SCHLIMMER": "worse",
    "TOLL": "great", "SUPER": "super", "WUNDERBAR": "wonderful", "WUNDERSCHOEN": "beautiful", "HERVORRAGEND": "excellent",
    "ANGENEHM": "pleasant", "GEMUETLICH": "cosy", "UNGEMUETLICH": "unpleasant", "RUHIG": "calm", "NORMAL": "normal",
    "TYPISCH": "typical", "GLEICH": "same", "ANDERS": "different", "VERSCHIEDEN": "different", "NEU": "new", "ALT": "old",
    "GROSS": "big", "KLEIN": "small", "LANG": "long", "KURZ": "short", "SCHNELL": "fast", "LANGSAM": "slow", "WICHTIG": "important",
    "SCHWER": "heavy", "SCHWIERIG": "difficult", "EINFACH": "simple", "RICHTIG": "right", "FALSCH": "wrong", "WAHR": "true",
    "ENORM": "enormous", "EXTREM": "extreme", "NIEDRIG": "low", "HOEHER": "higher", "SCHWARZ": "black", "GRAU": "grey", "ROT": "red",
    "GELB": "yellow", "GRUEN": "green", "BRAUN": "brown", "ORANGE": "orange", "GOLD": "gold", "BUNT": "colourful", "WAS": "what",
    "WER": "who", "WO": "where", "WIE": "how", "WARUM": "why", "WIEVIEL": "how much", "WIE-LANG": "how long", "WOHER": "where from",
    "LEIDER": "unfortunately", "ZUM-GLUECK": "luckily", "GLUECK": "luck", "ENDLICH": "finally", "TROTZDEM": "nevertheless",
    "DESHALB": "therefore", "DESWEGEN": "therefore", "DARUM": "that's why", "WEIL": "because", "WENN": "if", "OB": "whether",
    "ALSO": "so", "DOCH": "but still", "ERST": "only then", "ZUERST": "first", "ERSTMAL": "first", "VORHER": "before",
    "NAECHSTE": "next", "LETZTE": "last", "PROBLEM": "problem", "CHANCE": "chance", "RISIKO": "risk", "SCHADEN": "damage",
    "ANGST": "fear", "HERZ": "heart", "NATUR": "nature", "BAUM": "tree", "BLATT": "leaf", "BLUETE": "blossom", "PFLANZE": "plant",
    "WASSER": "water", "BODEN": "ground", "STEIN": "stone", "SAND": "sand", "LICHT": "light", "VOGEL": "bird", "HUND": "dog",
    "BAUER": "farmer", "WEIN": "wine", "KUCHEN": "cake", "PULLOVER": "pullover", "T-SHIRT": "T-shirt", "SCHIRM": "umbrella",
    "INTERNET": "internet", "TEXT": "text", "VIDEO": "video", "LESEN": "read", "HOEREN": "hear", "WIE-IMMER": "as always",
    "DAS-IST-ES": "that's it", "DAS-WAR-ES": "that was it", "NOCH-NICHT": "not yet", "AUCH-NICHT": "not either", "NICHT-MEHR": "no more",
    "PLOETZLICH": "suddenly", "DAUERND": "constantly", "DURCHGEHEND": "throughout", "VORUEBERGEHEND": "temporarily",
    "ALLGEMEIN": "generally", "EIGENTLICH": "actually", "TATSAECHLICH": "indeed", "WIRKLICH": "really", "GENAU": "exactly",
    "AKTUELL": "current", "BISHER": "so far", "WACHSEN": "grow", "SCHLAF": "sleep", "ZU-HAUSE": "at home", "NACH-HAUSE": "home",
    "DRAUSSEN": "outside", "MISCHUNG": "mix", "GEMISCHT": "mixed", "ERWARTEN": "expect", "UNTERSCHIED": "difference",
    "AUSNAHME": "exception", "BEISPIEL": "example", "ZUM-BEISPIEL": "for example", "WIEDER-ZURUECK": "back again",
    "NOCHEINMAL": "once more", "MAL": "once", "SCHON-WIEDER": "again", "SO-BLEIBEN": "stay like this", "GLEICH-BLEIBEN": "stay the same",
    "BLEIBEN-GLEICH": "stay the same", "WIE-GEBLIEBEN": "as it was", "AEHNLICH": "similar", "AEHNLCH": "similar", "DASSELBE": "the same",
    "SELBE": "same", "NICHT-HABEN": "not have", "FUEHLEN-WIE": "feel like", "UND-SO-WEITER": "and so on", "HAUPT": "main",
}

LETTERS = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ")


def english(g: str) -> str | None:
    if g in HIDDEN:
        return ""
    if g in W:
        return W[g]
    if len(g) == 1 and g in LETTERS:
        return f"letter {g}"
    for prefix in ("loc-", "poss-", "qu-", "cl-", "lh-"):
        if g.startswith(prefix):
            return english(g[len(prefix):])
    if g.endswith("-PLUSPLUS"):
        return english(g[: -len("-PLUSPLUS")])
    m = re.match(r"^(NICHT|NICHTALP)-(.+)$", g)
    if m:
        inner = english(m.group(2))
        return f"not {inner}" if inner else None
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vocab", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()
    itos = json.loads(args.vocab.read_text(encoding="utf-8"))["itos"]
    table = {g: english(g) for g in itos}
    known = sum(1 for g, e in table.items() if e)
    hidden = sum(1 for e in table.values() if e == "")
    args.out.write_text(json.dumps({
        "_note": "Rough word-by-word English for the fc10 (PHOENIX-2014 weather) glosses, hand-written for Hands Up; not a translation. null = unknown.",
        "words": table}, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"{len(itos)} glosses: {known} with an English word, {hidden} hidden tokens, {len(itos) - known - hidden} unknown")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
