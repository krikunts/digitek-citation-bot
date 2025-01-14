import * as tl from "node-telegram-bot-api";
import {InlineKeyboardButton} from "node-telegram-bot-api";

declare var BOT_TOKEN;
declare var SCRIPT_ID;

const telegramUrl = () => `https://api.telegram.org/bot${BOT_TOKEN}`;
const webAppUrl = () => `https://script.google.com/macros/s/${SCRIPT_ID}/exec`;

const getCitationSheet = () => SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
const getDataSheet = () => SpreadsheetApp.getActiveSpreadsheet().getSheets()[1];
const getDebugSheet = () => SpreadsheetApp.getActiveSpreadsheet().getSheets()[2];

const SIG = "@digitek_citation_bot";

function getMe() {
    var url = `${telegramUrl()}/getMe`;
    var response = UrlFetchApp.fetch(url);
    Logger.log(response.getContentText());
}

function unsetWebhook() {
    var url = `${telegramUrl()}/setWebhook?url=`;
    var response = UrlFetchApp.fetch(url);
    Logger.log(response.getContentText());
}

function setWebhook() {
    var url = `${telegramUrl()}/setWebhook?url=${webAppUrl()}`;
    var response = UrlFetchApp.fetch(url);
    Logger.log(response.getContentText());
}

type SendMessage = tl.SendMessageOptions & {
    chat_id: string | number,
    text?: string
}

function serialize(payload: object) {
    const result = {};
    for(const key in payload) if(payload.hasOwnProperty(key)) {
        const value = payload[key];
        if(value != null && typeof value === 'object') result[key] = JSON.stringify(value);
        else result[key] = value;
    }
    return result
}

function sendText(id, text: string, likeButton: InlineKeyboardButton) {
    if(text.length > 4096) {
        for(const chunk of text.match(/[^]{1,4096}/g)) {
            sendText(id, chunk, chunk.length < 4096 ? likeButton : null)
        }
        return
    }
    const payload: SendMessage = {
            chat_id: `${id}`,
            text: text,
            reply_markup: likeButton && {
                inline_keyboard: [[ likeButton ]]
            }
    };
    var response = UrlFetchApp.fetch(`${telegramUrl()}/sendMessage`, {
        method: 'post',
        payload: serialize(payload)
    });
    Logger.log(response.getContentText());
}

function answerCallbackQuery(id: string, text: string) {
    const payload: tl.AnswerCallbackQueryOptions = {
        callback_query_id: id,
        text: text
    };
    var response = UrlFetchApp.fetch(`${telegramUrl()}/answerCallbackQuery`, {
        method: 'post',
        payload: serialize(payload)
    });
    Logger.log(response.getContentText());
}

function editMessageReplyMarkup(chat_id: number, message_id: number, newButton: InlineKeyboardButton | null) {
    const payload: tl.EditMessageCaptionOptions = {
        chat_id: "" + chat_id,
        message_id: message_id,
        reply_markup: {
            inline_keyboard: [[ newButton ]]
        }
    };
    var response = UrlFetchApp.fetch(`${telegramUrl()}/editMessageReplyMarkup`, {
        method: 'post',
        payload: serialize(payload)
    });
    Logger.log(response.getContentText());
}

function sendSticker(id, file_id) {
    var response = UrlFetchApp.fetch(`${telegramUrl()}/sendSticker`, {
        method: 'post',
        payload: {
            chat_id: "" + id,
            sticker: file_id
        }
    });
    Logger.log(response.getContentText());
}

function UUID() {
    return Utilities.getUuid()
}

function doGet(e) {
    const [who, what] = getRandom();
    return HtmlService.createHtmlOutput(`${what} (c) ${who}`);
}

function getRandom(): [string, string, string, InlineKeyboardButton] {
    var max = getCitationSheet().getLastRow() - 1;
    var random = Math.floor(Math.random() * max) + 2;
    var range = getCitationSheet().getRange(random, 1, 1, 4);
    const [who, what, comment, likes] = range.getValues()[0];
    const likesObj = JSON.parse(likes || "{}");

    return [who, what, comment, { text: `${Object.keys(likesObj).length} ❤`, callback_data: `${random}` }];
}

function getLast(): [string, string, string, InlineKeyboardButton] {
    var last = getCitationSheet().getLastRow();
    var range = getCitationSheet().getRange(last, 1, 1, 4);
    const [who, what, comment, likes] = range.getValues()[0];
    const likesObj = JSON.parse(likes || "{}");

    return [who, what, comment, { text: `${Object.keys(likesObj).length} ❤`, callback_data: `${last}` }];
}

function getById(id: number): [string, string, string, InlineKeyboardButton] | null {
    var max = getCitationSheet().getLastRow();
    if(id <= 1 || id > max) return null;
    var range = getCitationSheet().getRange(id, 1, 1, 4);
    const [who, what, comment, likes] = range.getValues()[0];
    const likesObj = JSON.parse(likes || "{}");

    return [who, what, comment, { text: `${Object.keys(likesObj).length} ❤`, callback_data: `${id}` }];
}

function getTop(): [string, string, string, InlineKeyboardButton] | null {
    const last = getCitationSheet().getLastRow();
    const vals = getCitationSheet().getRange(`A2:D${last}`).getValues().map((it, ix) => [ix + 2, ...it]);
    var max = vals.sort(
        ([i1,,,, likes1], [i2,,,, likes2]) =>
            (Object.keys(JSON.parse(likes2 || "{}")).length - Object.keys(JSON.parse(likes1 || "{}")).length)
    )[0];

    const [id, who, what, comment, likes] = max;
    const likesObj = JSON.parse(likes || "{}");

    return [who, what, comment, { text: `${Object.keys(likesObj).length} ❤`, callback_data: `${id}` }];
}

function searchCitations(text: string): string[] {
    const last = getCitationSheet().getLastRow();
    return [...getCitationSheet().getRange(`A2:B${last}`).getValues().map((it, ix) => [ix + 2, ...it])
        .filter(([,, what]) => what.toLowerCase().indexOf(text.toLowerCase()) !== -1)
        .map(([id, who, what]) => `Цитата #${id}:\n${what} (c) ${who}`)];
}

function isAllowed(id) {
    var sheet = getDataSheet();

    const first = 2;
    const last = sheet.getLastRow();

    const values = sheet.getRange(`A${first}:A${last}`).getValues();

    for(const [value] of values) if(value == id) return true;
    return false;
}

function citeOfTheDay() {
    var sheet = getDataSheet();

    var row;
    for (row = 2; row <= sheet.getLastRow(); ++row) {
        var id = +sheet.getRange(row, 1).getValue();
        if (id < 0) {
            const [who, what, _, btn] = getRandom();
            sendText(id, "Цитата дня:\n" +`${what} (c) ${who}`, btn)
        }
    }
}

// this is somehow not in telegram's type definitions
interface TlUpdateFix {
    message ?: {
        forward_sender_name?: string
    }
}

type TlUpdate = tl.Update & TlUpdateFix;
type Message = TlUpdate['message']

function getForwardedName(m: Message) {
    if(m.forward_from) {
        return m.forward_from.first_name || m.forward_from.last_name || m.forward_from.username
    }
    if(m.forward_sender_name) {
        return m.forward_sender_name.split(" ")[0]
    }
    if(m.forward_signature) {
        return m.forward_signature
    }
    return "Some guy"
}

function COUNT_LIKES(column: string[][]) {
    var active = getCitationSheet().getLastRow();
    return column.map(it => it[0] && [Object.keys(JSON.parse(it[0])).length] || [0]).slice(0, active - 1);
}

function success(id: number) {
    const variants = [
        "Ok",
        "k",
        "Понял, принял",
        "Ладушки",
        "Принято",
        "+",
        "Ладно, ладно",
        ")",
        "👌",
        "#sticker#CAADAgAD0B8AAqKKlgEj1GXRWttPPRYE",
        "#sticker#CAADAgADaQAD4aRlBU-4f77gfg6wFgQ",
        "#sticker#CAADAgADkA0AAulVBRj7PO_rEYFLRhYE",
        "#sticker#CAADAgAD5wIAArrAlQUWBDuqQjBTVBYE",
        "#sticker#CAADAgAD0gMAAsSraAvL_RrrpopXKxYE",
        "#sticker#CAADAgADsAMAAvoLtgiYBpwYpLy1OhYE",
        "#sticker#CAADAgAD_goAAipVGAIceOHE1A-ZDRYE",
        "#sticker#CAADAgADUgADI1nODLUg_PUBd8WYFgQ",
        "#sticker#CAADAgAD8AIAArVx2ga4Ryudl_pd6BYE",
        "#sticker#CAADAgADnAADV08VCF49wTfBNSDPFgQ",
        "#sticker#CAADBAADCgEAAtDeBQABitq9tV0QVxIWBA",
        "#sticker#CAADAgADoQADSMbXDWv_X0yWfIDDFgQ",
        "#sticker#CAADBQADqgAD3HgMCHiJ-htl5pJ3FgQ",
        "#sticker#CAADBAADNQADXHLuDXgxa8XOdXcsFgQ",
        "#sticker#CAADBAADBS4AAnzugwumtbRvD4kKCRYE",
        "#sticker#CAADAgADfwIAAgk7OxMbpktijzn0mxYE",
        "#sticker#CAADAgADFQADLdJqJ6EwxGXGQvrVFgQ",
        "#sticker#CAADAgADSRwAAkKvaQABevwAAfvwwHBqFgQ",
    ];

    const ok = variants[Math.floor(Math.random() * variants.length)];

    if(ok.indexOf("#sticker#") == 0) {
        sendSticker(id, ok.replace("#sticker#", ""))
    } else sendText(id, ok, null);
}

function tryManual(text, id) {
    if (text.trim().indexOf("/cite") == 0) {
        const tryout = text.replace("/cite", "").replace("(с)", "(c)").trim().split("(c)");
        if (tryout.length != 2) {
            sendText(id, "Попробуй так: /cite Сообщение (c) Вася", null);
            return;
        }
        const [ctext, name] = tryout;
        success(id);
        getCitationSheet().appendRow([name.trim(), ctext.trim(), `by ${SIG}`, "{}"]);
    }
}

function handleMessage(message: Message) {
    var text = message.text;
    var id = message.chat.id;

    if (!text) return;

    text = text.replace(SIG, "");

    if (text.split(" ")[0] === "/uuid") {
        text = text.replace("/uuid", "").trim()
    }

    if (text.trim() === getDataSheet().getRange(1, 1).getValue()) {
        if (isAllowed(id)) return;
        getDataSheet().appendRow([id]);
        sendText(id, "Ок, погнали", null);
        return;
    }

    if (!isAllowed(id)) {
        sendText(id, "Ты кто? Пришли мне данные ячейки A1 из таблицы 'Data' плез", null);
        return;
    }

    if (text.trim() === '/random') {
        const [who, what, _, cid] = getRandom();
        sendText(id, `${what} (c) ${who}`, cid);
        return;
    }

    if (text.trim() === '/top') {
        const [who, what, _, cid] = getTop();
        sendText(id, `${what} (c) ${who}`, cid);
        return;
    }

    if (text.trim() === '/last') {
        const [who, what, _, cid] = getLast();
        sendText(id, `${what} (c) ${who}`, cid);
        return;
    }

    if (text.trim().indexOf('/read') === 0) {
        const cid = parseInt(text.replace('/read', '').trim());
        if (cid != cid) {
            sendText(id, "Нет такой цитаты", null);
            return;
        }
        const cite = getById(cid);
        if (!cite) {
            sendText(id, "Нет такой цитаты", null);
            return;
        }
        const [who, what, _, btn] = cite;
        sendText(id, `${what} (c) ${who}`, btn);
        return;
    }
    
    if (text.trim().indexOf('/search') === 0) {
        const min_search = 3;
        const searchText = text.replace('/search', '').trim();
        if(searchText.length < min_search) {
            sendText(id, "А поконкретнее?", null);
            return;
        }
        const citations = searchCitations(searchText);
        if (citations.length == 0) {
            sendText(id, "Нет таких цитат", null);
            return;
        }
        sendText(id, citations.join("\n\n"), null);
        return;
    }

    if (message.chat.type === "private") {
        if (!message.forward_from && !message.forward_sender_name) {
            tryManual(text, id);
            return
        }
        var name = getForwardedName(message);
        success(id);
        getCitationSheet().appendRow([name, text, `by ${SIG}`, "{}"]);
    }

    if (text.trim() === "/cite") {
        if (!message.reply_to_message) {
            sendText(id, "Я умею цитировать только реплаи, сорян\nМожешь зафорвардить сообщение мне в личку", null);
            return;
        }
        var rm = message.reply_to_message;
        var name = rm.from.first_name || rm.from.username;
        var text = rm.text;
        success(id);
        getCitationSheet().appendRow([name, text, `by ${SIG}`, "{}"]);
    }

    tryManual(text, id);
}

function handleCallback(callback_query: tl.CallbackQuery) {
    const scriptLock = LockService.getDocumentLock();

    const citationId = parseInt(callback_query.data);
    if(citationId != citationId) return;
    const cite = getById(citationId);
    if(cite == null) return;

    let likes: object;
    let like: any | undefined;
    scriptLock.waitLock(30000);
    try {
        const range = getCitationSheet().getRange(citationId, 4);

        likes = JSON.parse(range.getValue() || "{}") as object;
        const userString = '' + callback_query.from.id;
        like = likes[userString];
        if(like) delete likes[userString];
        else likes[userString] = true;
        range.setValue(JSON.stringify(likes));
    } finally {
        scriptLock.releaseLock();
    }
    editMessageReplyMarkup(callback_query.message.chat.id, callback_query.message.message_id, {
        text: Object.keys(likes).length + " ❤",
        callback_data: `${citationId}`
    });
    answerCallbackQuery(callback_query.id, like? "Разлайкано =(" : "Полайкано");
}

function doPost(e) {
    getDebugSheet().appendRow([e.postData.contents]);

    var data = JSON.parse(e.postData.contents) as TlUpdate;
    if (data.message) handleMessage(data.message);
    if (data.callback_query) handleCallback(data.callback_query);
}
