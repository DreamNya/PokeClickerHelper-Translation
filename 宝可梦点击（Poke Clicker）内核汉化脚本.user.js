// ==UserScript==
// @name         宝可梦点击（Poke Clicker）内核汉化脚本
// @namespace    PokeClickerHelper
// @version      0.10.19-b
// @description  采用内核汉化形式，目前汉化范围：所有任务线、城镇名
// @author       DreamNya, ICEYe, iktsuarpok, 我是谁？, 顶不住了, 银☆星
// @match        http://localhost:3000/
// @match        https://www.pokeclicker.com
// @match        https://g8hh.github.io/pokeclicker/
// @match        https://pokeclicker.g8hh.com
// @match        https://pokeclicker.g8hh.com.cn/
// @match        https://yx.g8hh.com/pokeclicker/
// @match        https://dreamnya.github.io/pokeclicker/
// @icon         https://scriptcat.org/api/v2/resource/image/Y3VU6C1i3QnlBewG
// @grant        none
// @run-at       document-end
// @license      MIT
// @connect      cdn.jsdelivr.net
// ==/UserScript==
/* global TownList, QuestLine:true, Notifier, MultipleQuestsQuest, App */

//储存汉化文本
const Translation = {};
const TranslationHelper = { Translation, exporting: false };
(window.PokeClickerHelper || window.PokeClickerHelperPlus || window).TranslationHelper = TranslationHelper;

// 引用外部资源
// CDN: https://cdn.jsdelivr.net
// GIT: https://github.com/DreamNya/PokeClickerHelper-Translation
const resources = ["QuestLine", "Town"];
const now = Date.now();

for (const resource of resources) {
    Translation[resource] = await FetchResource(resource).catch(() => {
        const cache = localStorage.getItem(`PokeClickerHelper-Translation-${resource}`);
        if (cache) {
            console.log("PokeClickerHelper-Translation", "fallback获取json", resource);
            return JSON.parse(cache);
        } else {
            console.log("PokeClickerHelper-Translation", "all failed获取json", resource);
            Notifier.notify({
                title: "宝可梦点击（Poke Clicker）内核汉化脚本",
                message: `请求汉化json失败，请检查网络链接或更新脚本\n无法完成汉化：${resource}`,
                timeout: 6000000,
            });
            return {};
        }
    });
}

async function FetchResource(resource) {
    const past = +localStorage.getItem(`PokeClickerHelper-Translation-${resource}-lastModified`) ?? 0;
    if (now - past <= 86400 * 3 * 1000) {
        const cache = localStorage.getItem(`PokeClickerHelper-Translation-${resource}`);
        if (cache) {
            console.log("PokeClickerHelper-Translation", "从存储获取json", resource);
            return JSON.parse(cache);
        }
    }
    const url = `https://cdn.jsdelivr.net/gh/DreamNya/PokeClickerHelper-Translation/json/${resource}.json`;
    const response = await fetch(url);
    if (response.status == 200) {
        const json = await response.json();
        console.log("PokeClickerHelper-Translation", "从CDN获取json", resource);
        localStorage.setItem(`PokeClickerHelper-Translation-${resource}`, JSON.stringify(json));
        localStorage.setItem(`PokeClickerHelper-Translation-${resource}-lastModified`, now);
        return json;
    } else {
        throw new Error();
    }
}

// 汉化城镇
Object.values(TownList).forEach((t) => {
    const name = Translation.Town[t.name];
    t.displayName = name ?? t.name;
});
// 修改城镇文本显示绑定
$('[data-bind="text: player.town().name"]').attr("data-bind", "text: player.town().displayName");
$("[data-town]").each(function () {
    const name = $(this).attr("data-town");
    $(this).attr("data-town", Translation.Town[name] || name);
});

// 汉化任务线
QuestLine.prototype.realAddQuest = QuestLine.prototype.addQuest;
QuestLine.prototype.addQuest = new Proxy(QuestLine.prototype.realAddQuest, {
    apply(target, questline, [quest]) {
        const name = questline.name;
        const translation = Translation.QuestLine[name];
        if (translation) {
            const description = quest.description;
            const displayDescription = translation.descriptions[description];
            if (displayDescription) {
                Object.defineProperty(quest, "description", {
                    get: () => (TranslationHelper.exporting ? description : displayDescription),
                });
            }
            if (quest instanceof MultipleQuestsQuest) {
                quest.quests.forEach((q) => {
                    const description = quest.description;
                    const displayDescription = translation.descriptions[description];
                    if (displayDescription) {
                        Object.defineProperty(q, "description", {
                            get: () => (TranslationHelper.exporting ? description : displayDescription),
                        });
                    }
                });
            }
        }

        return Reflect.apply(target, questline, [quest]);
    },
});
window.realQuestLine = QuestLine;
QuestLine = new Proxy(window.realQuestLine, {
    construct(...args) {
        const questline = Reflect.construct(...args);
        const { name, description } = questline;
        const translation = Translation.QuestLine[name];

        const displayName = translation?.name;
        const displayDescription = translation?.description[description];
        Object.defineProperty(questline, "displayName", {
            get: () => (TranslationHelper.exporting ? name : displayName ?? name),
        });

        if (displayDescription) {
            Object.defineProperty(questline, "description", {
                get: () => (TranslationHelper.exporting ? description : displayDescription),
            });
        }

        return questline;
    },
});

// 修改任务线文本显示绑定
document.querySelector(
    "#questDisplayContainer > div.questDisplayBlock.questLine > div.card-header > knockout[data-bind='text: $data.name']"
).dataset.bind = "text: $data.displayName";
document.querySelector("#bulletinBoardModal div.modal-body h5[data-bind='text: $data.name']").dataset.bind =
    "text: $data.displayName";
document
    .querySelectorAll('#questsModalQuestLinesPane knockout.font-weight-bold.d-block[data-bind="text: $data.name"]')
    .forEach((i) => (i.dataset.bind = "text: $data.displayName"));

/*
Translations = Object.assign({}, ...Object.values(Translation));
q = App.game.quests.questLines();
q.reduce((obj, questline) => {
    const subObj = {};
    subObj.name = Translations[questline.name] ?? questline.name;
    subObj.description = Object.fromEntries(questline.quests?.().map((i) => [i.description, Translations[i.description] ?? ""]));
    obj[questline.name] = subObj;
    return obj;
}, {});
*/

TranslationHelper.ExportTranslation = {};
TranslationHelper.ExportTranslation.QuestLine = function () {
    TranslationHelper.exporting = true;
    const json = App.game.quests.questLines().reduce((obj, questline) => {
        const { name, description } = questline;
        const translation = Translation.QuestLine[name];
        const subObj = {};
        subObj.name = translation.name ?? name;
        subObj.description = { [description]: translation.description[description] ?? "" };
        subObj.descriptions = questline.quests().reduce((d, q) => {
            d[q.description] = translation.descriptions[q.description] ?? "";
            if (q instanceof MultipleQuestsQuest) {
                q.quests.forEach((qq) => {
                    d[qq.description] = translation.descriptions[qq.description] ?? "";
                });
            }
            return d;
        }, {});
        obj[name] = subObj;
        return obj;
    }, {});
    TranslationHelper.exporting = false;
    return json;
};
