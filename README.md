# STpedia

**Русский** | [English below](#english)

Карманная энциклопедия для чатов SillyTavern. Выделите слово или фразу в сообщении, нажмите «?», и появится плашка в стиле Википедии.

## Возможности
- **Три режима** (в настройках): Авто (сначала Википедия, затем ИИ), только Википедия, только ИИ-энциклопедия. В авто-режиме на плашке две вкладки для ручного переключения.
- **Википедия:** вводная часть статьи, по желанию фото, а для реальных личностей карточка из Викиданных (даты и места рождения и смерти, страна, род деятельности). Русский язык с запасным английским, понимает склонения («Икара» найдёт «Икар»).
- **ИИ-энциклопедия:** статья о вымышленных понятиях и персонажах по мотивам истории (карточка, персона, лорбук, заметки автора, чат). Профиль Таверны через Connection Manager или свой API. Статьи запоминаются в чате.
- Плашка около 4:3 в стиле мобильной Википедии, темы (светлая, тёмная, сепия, цвета Таверны), размер текста и ширина. На телефоне плашка выезжает снизу, кнопка «?» не мешается системной панели выделения.
- Переходы по выделению внутри самой плашки, кнопка «Назад».
- Избранное: звёздочка на плашке сохраняет статью в настройках; из списка можно открыть статью в Википедии или показать её в плашке.
- На компьютере плашку можно перетаскивать за заголовок.
- Для имён открывается статья об имени (например «Авель (имя)»), а не самый известный человек с этим именем. Умный разбор предложений: точки в сокращениях и скобках не обрывают текст.
- Русский и английский интерфейс, ПК и телефон.

## Приватность
STpedia **не читает ключи Таверны**. ИИ-режим работает через профиль Connection Manager (запрос выполняет сама Таверна) или через собственный API в настройках расширения. В Википедию и Викиданные уходит только выделенный текст.

## Установка
`Extensions → Install extension`: `https://github.com/Ayrissa/STpedia`

---

## English

A pocket encyclopedia for SillyTavern chats. Select a word or phrase in a message, tap "?", and get a Wikipedia-style card.

### Features
- **Three modes** (in settings): Auto (Wikipedia first, then AI), Wikipedia only, AI encyclopedia only. In Auto mode the card has two tabs for manual switching.
- **Wikipedia:** the article intro, an optional photo, and for real people a Wikidata card (birth/death dates and places, country, occupation). Russian with an English fallback, understands inflected forms.
- **AI encyclopedia:** articles about fictional terms and characters based on the story (card, persona, lorebook, author's note, chat). A Connection Manager profile or your own API. Articles are remembered per chat.
- ~4:3 card in a mobile-Wikipedia style, themes (light, dark, sepia, SillyTavern colors), text size and width. On phones it slides up from the bottom and the "?" button stays clear of the system selection bar.
- Follow selections inside the card itself, with a Back button.
- Favorites: the star on the card saves the article in the settings; from the list you can open it on Wikipedia or show it in the card.
- On desktop the card can be dragged by its header.
- For given names the article about the name opens (e.g. "Abel (given name)"), not the most famous person. Smart sentence splitting: dots in abbreviations and parentheses no longer cut the text.
- Russian and English UI, desktop and mobile.

### Privacy
STpedia **never reads SillyTavern's keys**. The AI mode uses a Connection Manager profile (the request is made by SillyTavern itself) or STpedia's own API settings. Only the selected text is sent to Wikipedia and Wikidata.

### Install
`Extensions → Install extension`: `https://github.com/Ayrissa/STpedia`

## License
MIT © Ayrissa
