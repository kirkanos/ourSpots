# Schriften

Selbst gehostet statt über Google Fonts eingebunden – aus drei Gründen: Der
Rendercontainer braucht dieselben Schriften wie der Browser des Nutzers (sonst
sähe das Video anders aus als die Vorschau), die App soll offline laufen, und
es geht niemanden an, wer sich hier eine Reise ansieht.

| Datei | Schrift | Lizenz |
|---|---|---|
| `caveat-700-*.woff2` | [Caveat](https://fonts.google.com/specimen/Caveat) Bold, Impallari Type | SIL Open Font License 1.1 |
| `roboto-mono-400-*.woff2` | [Roboto Mono](https://fonts.google.com/specimen/Roboto+Mono) Regular, Christian Robertson | SIL Open Font License 1.1 |

Je Schrift zwei Dateien: `latin` deckt Westeuropa ab, `latin-ext` kommt für
Namen mit å, ø, ł oder ř dazu. Der Browser lädt die zweite Datei nur, wenn ein
Zeichen daraus wirklich vorkommt – das regelt der `unicode-range` in styles.css.

Verwendet werden sie allein für die Etappenschilder im Reisevideo. Die übrige
Oberfläche bleibt bei der Systemschrift.
