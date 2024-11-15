// ==UserScript==
// @name         宝可梦点击（Poke Clicker）内核汉化脚本
// @namespace    PokeClickerHelper
// @version      0.10.23-a
// @description  采用内核汉化形式，目前汉化范围：所有任务线、城镇名、NPC及对话
// @author       DreamNya, ICEYe, iktsuarpok, 我是谁？, 顶不住了, 银☆星, TerVoid
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
// @connect      raw.githubusercontent.com
// ==/UserScript==
/* global TownList, QuestLine:true, Notifier, MultipleQuestsQuest, App, NPC, NPCController, GameController */

//储存汉化文本
const Translation = {};
const TranslationHelper = { Translation, exporting: false };
const CoreModule = window.PokeClickerHelper ?? window.PokeClickerHelperPlus;
(CoreModule ?? window).TranslationHelper = TranslationHelper;
TranslationHelper.config = {
    CDN: CoreModule?.get("TranslationHelperCDN", "jsDelivr", true) ?? "jsDelivr",
    UpdateDelay: CoreModule?.get("TranslationHelperUpdateDelay", 30, true) ?? 30,
    Timeout: CoreModule?.get("TranslationHelperTimeout", 10000, true) ?? 10000,
};

// 引用外部资源
// CDN-jsDelivr: https://cdn.jsdelivr.net
// CDN-GitHub: https://raw.githubusercontent.com
// GIT: https://github.com/DreamNya/PokeClickerHelper-Translation
const CDN = {
    jsDelivr: "https://cdn.jsdelivr.net/gh/DreamNya/PokeClickerHelper-Translation/json/",
    GitHub: "https://raw.githubusercontent.com/DreamNya/PokeClickerHelper-Translation/main/json/",
};
const resources = ["QuestLine", "Town", "NPC"];
const now = Date.now();
const failed = [];

Notifier.notify({
    title: "宝可梦点击（Poke Clicker）内核汉化脚本",
    message: `汉化正在加载中\n此时加载存档可能导致游戏错误\n若超过1分钟此提示仍未消失，则脚本可能运行出错`,
    timeout: 600000,
});

for (const resource of resources) {
    Translation[resource] = await FetchResource(resource).catch(() => {
        const cache = localStorage.getItem(`PokeClickerHelper-Translation-${resource}`);
        if (cache) {
            console.log("PokeClickerHelper-Translation", "fallback获取json", resource);
            return JSON.parse(cache);
        } else {
            console.log("PokeClickerHelper-Translation", "all failed获取json", resource);
            failed.push(resource);
            return {};
        }
    });
}

async function FetchResource(resource, force = false) {
    const past = +(localStorage.getItem(`PokeClickerHelper-Translation-${resource}-lastModified`) ?? 0);
    if (
        !force &&
        (TranslationHelper.config.UpdateDelay < 0 || now - past <= 86400 * 1000 * TranslationHelper.config.UpdateDelay)
    ) {
        const cache = localStorage.getItem(`PokeClickerHelper-Translation-${resource}`);
        if (cache) {
            console.log("PokeClickerHelper-Translation", "从存储获取json", resource);
            return JSON.parse(cache);
        }
    }
    const url = `${CDN[TranslationHelper.config.CDN]}${resource}.json`;
    const response = await fetch(url, {
        cache: "no-store",
        // 超时中断
        signal: AbortSignal.timeout(+TranslationHelper.config.Timeout || 10000),
    });
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

Translation.NPCName = Translation.NPC.NPCName ?? {};
Translation.NPCDialog = Translation.NPC.NPCDialog ?? {};
TranslationHelper.toggleRaw = false;

// 汉化城镇
Object.values(TownList).forEach((t) => {
    const name = Translation.Town[t.name];
    t.displayName = name ?? t.name;
});
// 修改城镇文本显示绑定
$('[data-bind="text: player.town.name"]').attr("data-bind", "text: player.town.displayName");
$("[data-town]").each(function () {
    const name = $(this).attr("data-town");
    $(this).attr("data-town", Translation.Town[name] || name);
});

GameController.realShowMapTooltip = GameController.showMapTooltip;
GameController.showMapTooltip = function (tooltipText) {
    const translationTown = Translation.Town[tooltipText];
    return this.realShowMapTooltip(translationTown ?? tooltipText);
};

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
                    const description = q.description;
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
$("#questLineDisplayBody knockout[data-bind='text: $data.name']").attr("data-bind", "text: $data.displayName");
$("#bulletinBoardModal div.modal-body h5[data-bind='text: $data.name']").attr("data-bind", "text: $data.displayName");
$('#questsModalQuestLinesPane knockout.font-weight-bold.d-block[data-bind="text: $data.name"]').each(function () {
    this.dataset.bind = "text: $data.displayName";
});

// 汉化NPC
Object.values(TownList)
    .flatMap((i) => i.npcs)
    .forEach((npc) => {
        if (!npc || "rawDialog" in npc) {
            return;
        }
        npc.displayName = Translation.NPCName[npc.name] ?? npc.name;
        npc.rawDialog = npc.dialog;
        npc.translatedDialog = npc.rawDialog?.map((d) => Translation.NPCDialog[d] ?? d);
        delete npc.dialog;
    });
Object.defineProperty(NPC.prototype, "dialog", {
    get() {
        return TranslationHelper.toggleRaw ? this.rawDialog : this.translatedDialog;
    },
});

// 修改NPC文本显示绑定
document.querySelector(
    "#townView button[data-bind='text: $data.name, click: () => NPCController.openDialog($data)']"
).dataset.bind = "text: $data.displayName, click: () => NPCController.openDialog($data)";
document.querySelector("#npc-modal h5").dataset.bind = "text: $data.displayName";

// 导出完整json方法
TranslationHelper.ExportTranslation = {};
TranslationHelper.ExportTranslation.QuestLine = function () {
    TranslationHelper.exporting = true;
    const json = App.game.quests.questLines().reduce((obj, questline) => {
        const { name, description } = questline;
        const translation = Translation.QuestLine[name];
        const subObj = {};
        subObj.name = translation?.name ?? name;
        subObj.description = { [description]: translation?.description[description] ?? "" };
        subObj.descriptions = questline.quests().reduce((d, q) => {
            d[q.description] = translation?.descriptions[q.description] ?? "";
            if (q instanceof MultipleQuestsQuest) {
                q.quests.forEach((qq) => {
                    d[qq.description] = translation?.descriptions[qq.description] ?? "";
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

TranslationHelper.ExportTranslation.NPC_format = function () {
    const toggleRaw = TranslationHelper.toggleRaw;
    TranslationHelper.toggleRaw = true;
    const json = Object.values(TownList).reduce((obj, town) => {
        const npcs = town.npcs;
        if (npcs?.length > 0) {
            obj[town.name] = npcs.map((npc) => {
                const subObj = {
                    name: { [npc.name]: Translation.NPCName[npc.name] ?? "" },
                };
                if (npc.dialog?.length > 0) {
                    subObj.dialog = Object.fromEntries(npc.dialog.map((d) => [d, Translation.NPCDialog[d] ?? ""]));
                }
                return subObj;
            });
        }
        return obj;
    }, {});
    TranslationHelper.toggleRaw = toggleRaw;
    return json;
};

TranslationHelper.ExportTranslation.NPC = function (override) {
    const NPC_format = override || this.NPC_format();
    const NPCDialog = Object.assign(
        {},
        ...Object.values(NPC_format)
            .flat()
            .map((i) => i.dialog)
            .filter((i) => i)
    );
    const NPCName = Object.assign(
        {},
        ...Object.values(NPC_format)
            .flat()
            .map((i) => i.name)
            .filter((i) => i)
    );
    const json = {
        NPCName,
        NPCDialog,
    };
    return json;
};

TranslationHelper.ExportTranslation.Town = function () {
    const json = Object.fromEntries(
        Object.keys(TownList).map((townName) => {
            return [townName, Translation.Town[townName] ?? ""];
        })
    );
    return json;
};

// UI (需要PokeClickerHelper)
if (CoreModule) {
    const prefix = CoreModule.UIContainerID[0].replace("#", "").replace("Container", "") + "TranslationHelper";

    CoreModule.UIDOM.push(`
    <div id="${prefix}" class="custom-row">
        <div class="contentLabel">
            <label>内核汉化</label>
        </div>
        <div style="flex: auto;">
            <button id="${prefix}Refresh" class="btn btn-sm btn-primary mr-1" data-save="false" title="刷新游戏后强制请求汉化json&#10;*仅清空脚本缓存，可能存在浏览器缓存需手动清理">清空缓存</button>
            <button id="${prefix}Toggle" class="btn btn-sm btn-primary mr-1" data-save="false" value="切换原文" title="仅NPC对话支持热切换（*其他汉化暂不支持）">切换原文</button>
        </div>
        <div class="contentContainer d-flex ml-2 mt-2" style="flex: auto;align-items: center;flex-wrap: wrap;">
            <div class="m-auto d-flex" style="align-items: baseline; width: 100%;">
                <label>
                    CDN
                </label>
                <select id="${prefix}CDN" title="选择任一可连通CDN即可" data-save="global" class="custom-select m-2" style="width: 67%; text-align: center;">
                    <option value="jsDelivr">
                        cdn.jsdelivr.net
                    </option>
                    <option value="GitHub">
                        raw.githubusercontent.com
                    </option>
                </select>
                <button id="${prefix}Test" class="btn btn-sm btn-primary" data-save="false" title="测试CDN连通情况">
                    测试
                </button>
            </div>
            <div class="mt-2 m-auto d-flex">
                <div class="form-floating" style="width: 30%;">
                    <input type="number" class="form-control" id="${prefix}UpdateDelay" data-save="global" step="1" value="${TranslationHelper.config.UpdateDelay}" style="text-align: right; height: 45px;">
                    <label style="padding-right: 0!important; padding-top: 12px!important; font-size: 12px;">
                        更新周期（天）
                    </label>
                </div>
                <div class="form-floating ml-3" style="width: 32%;">
                    <input type="number" class="form-control" id="${prefix}Timeout" data-save="global" step="100" value="${TranslationHelper.config.Timeout}" min="3000" style="text-align: right; height: 45px;">
                    <label style="padding-right: 0!important; padding-top: 12px!important; font-size: 12px;">
                        请求超时（毫秒）
                    </label>
                </div>
                <div id="${prefix}TestResult" style="margin: auto; width: 30%; text-align: center; color: blue;">
                    测试结果：未测试
                </div>
            </div>
        </div>
    </div>
    `);
    CoreModule.UIlistener.push(() => {
        $(`#${prefix}`)
            .on("click", `#${prefix}Refresh`, function () {
                this.disabled = true;
                window.PCH_ForceRefreshTranslation(false);
            })
            .on("click", `#${prefix}Toggle`, function () {
                if (this.value == "切换原文") {
                    $(this).text((this.value = "切换汉化"));
                    TranslationHelper.toggleRaw = true;
                } else {
                    $(this).text((this.value = "切换原文"));
                    TranslationHelper.toggleRaw = false;
                }
                if ($("#npc-modal").is(":visible")) {
                    NPCController.selectedNPC(NPCController.selectedNPC());
                }
            })
            .on("change", "[data-save=global]", function () {
                const id = this.id.replace(prefix, "");
                if (this.value != "") {
                    TranslationHelper.config[id] = this.value;
                }
            })
            .on("click", `#${prefix}Test`, async function () {
                this.disabled = true;
                const start = Date.now();
                const result = await FetchResource("Town", true)
                    .then(() => {
                        const now = Date.now();
                        return `测试结果：成功<br>${now - start}ms`;
                    })
                    .catch(() => {
                        return `测试结果：超时<br>不够科学`;
                    });
                this.disabled = false;
                $(`#${prefix}TestResult`).html(result);
            });
    });
}

if (failed.length == 0) {
    window.PCH_ForceRefreshTranslation = (refresh = true) => {
        resources.forEach((resource) => localStorage.removeItem(`PokeClickerHelper-Translation-${resource}-lastModified`));
        refresh && location.reload();
    };
    Notifier.notify({
        title: "宝可梦点击（Poke Clicker）内核汉化脚本",
        message: `汉化加载完毕\n可以正常加载存档\n\n<button class="btn btn-block btn-success" onclick="window.PCH_ForceRefreshTranslation()" data-dismiss="toast">清空脚本汉化缓存并刷新</button>`,
        timeout: 15000,
    });
} else {
    Notifier.notify({
        title: "宝可梦点击（Poke Clicker）内核汉化脚本",
        message: `请求汉化json失败，请检查网络链接或更新脚本\n无法完成汉化：${failed.join(" / ")}`,
        timeout: 6000000,
    });
}

setTimeout(() => $('.toast:contains("汉化正在加载中") [data-dismiss="toast"]').click(), 1000);
