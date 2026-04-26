// ==UserScript==
// @name         宝可梦点击（Poke Clicker）内核汉化脚本
// @namespace    PokeClickerHelper
// @version      0.10.25-d
// @description  采用内核汉化形式，目前汉化范围：所有任务线、NPC、成就、地区、城镇、道路、道馆
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
/* global TownList, QuestLine:true, Notifier, MultipleQuestsQuest, App, NPC, NPCController, GameController, ko,
   GameConstants, SubRegions, Routes, GymList, Gym, Achievement, SecretAchievement, AchievementHandler, AchievementTracker,
   PokemonHelper, pokemonMap, GameHelper
*/

class TranslationCore {
    Translation = {};
    TranslationCache = {};
    parserSubcribers = new Set();
    modules = {};
    #failed = [];
    #now = Date.now();

    CoreModule = window.PokeClickerHelper ?? window.PokeClickerHelperPlus;

    CDN = {
        jsDelivr: "https://cdn.jsdelivr.net/gh/DreamNya/PokeClickerHelper-Translation@main/json/",
        GitHub: "https://raw.githubusercontent.com/DreamNya/PokeClickerHelper-Translation/main/json/",
    };
    defaultConfig = {
        CDN: "jsDelivr",
        UpdateDelay: 30, // days
        Timeout: 10000, // ms
        Formatter: "·",
    };
    config = {
        CDN: this.CoreModule?.get("TranslationHelperCDN", this.defaultConfig.CDN, true) ?? this.defaultConfig.CDN,
        UpdateDelay:
            this.CoreModule?.get("TranslationHelperUpdateDelay", this.defaultConfig.UpdateDelay, true) ??
            this.defaultConfig.UpdateDelay,
        Timeout: this.CoreModule?.get("TranslationHelperTimeout", this.defaultConfig.Timeout, true) ?? this.defaultConfig.Timeout,
        Formatter:
            this.CoreModule?.get("TranslationHelperFormatter", this.defaultConfig.Formatter, true) ??
            this.defaultConfig.Formatter,
    };

    _toggleRaw = ko.observable(false).extend({ boolean: null });
    _exporting = ko.observable(false).extend({ boolean: null });

    ExportTranslation = {};

    constructor() {
        this.#init();
    }

    #init() {
        Object.defineProperty(this.TranslationHelper, "toggleRaw", {
            get: () => this._toggleRaw(),
            set: (newValue) => {
                this._toggleRaw(newValue);
            },
        });
        Object.defineProperty(this.TranslationHelper, "exporting", {
            get: () => this._exporting(),
            set: (newValue) => {
                this._exporting(newValue);
            },
        });

        window.TranslationHelper = this.TranslationHelper;
        if (this.CoreModule) {
            this.CoreModule.TranslationHelper = this.TranslationHelper;
        }
    }

    registerModule(module) {
        module.injectCore(this);
        this.modules[module.name] = module;
        const enabled = this.CoreModule?.get(`TranslationHelperSwitch${module.name}`, true, true) ?? true;
        if (!enabled) {
            module.disabled = true;
        }
    }

    async start() {
        Notifier.notify({
            title: "宝可梦点击（Poke Clicker）内核汉化脚本",
            message: `汉化正在加载中\n此时加载存档可能导致游戏错误\n若超过1分钟此提示仍未消失，则脚本可能运行出错`,
            timeout: 600000,
        });

        for (const module of Object.values(this.modules)) {
            if (module.disabled) {
                continue;
            }
            if (module.translation.length > 0) {
                await this.#pullResource(module.name);
            }
            if (module.disabled) {
                continue;
            }
            try {
                module.init();
                if (module.exportData) {
                    this.TranslationHelper.ExportTranslation[module.name] = module.exportData;
                }
                if (module.parser) {
                    this.parserSubcribers.add(module.parser);
                }
            } catch (e) {
                console.error(`[汉化模块加载失败]: ${module.name}`, e);
            }
        }

        this.#finish();
    }

    async #pullResource(resource) {
        this.TranslationCache[resource] = await this.#fetchResource(resource).catch(() => {
            const cache = localStorage.getItem(`PokeClickerHelper-Translation-${resource}`);
            if (cache) {
                console.log("PokeClickerHelper-Translation", "fallback获取json", resource);
                return cache;
            } else {
                console.log("PokeClickerHelper-Translation", "all failed获取json", resource);
                this.#failed.push(resource);
                this.modules[resource].disabled = true;
                return "{}";
            }
        });
    }

    async #fetchResource(resource, force = false) {
        const past = +(localStorage.getItem(`PokeClickerHelper-Translation-${resource}-lastModified`) ?? 0);
        if (
            !force &&
            (this.TranslationHelper.config.UpdateDelay < 0 ||
                this.#now - past <= 86400 * 1000 * this.TranslationHelper.config.UpdateDelay)
        ) {
            const cache = localStorage.getItem(`PokeClickerHelper-Translation-${resource}`);
            if (cache) {
                console.log("PokeClickerHelper-Translation", "从存储获取json", resource);
                return cache;
            }
        }

        const url = `${this.CDN[this.TranslationHelper.config.CDN]}${resource}.json`;
        const response = await fetch(url, {
            cache: "no-store",
            signal: AbortSignal.timeout(+this.TranslationHelper.config.Timeout || 10000),
        });

        if (response.ok) {
            const text = await response.text();
            console.log("PokeClickerHelper-Translation", "从CDN获取json", resource);
            localStorage.setItem(`PokeClickerHelper-Translation-${resource}`, text);
            localStorage.setItem(`PokeClickerHelper-Translation-${resource}-lastModified`, this.#now);
            return text;
        } else {
            throw new Error(`fetch error name:${resource}, status: ${response.status}`);
        }
    }

    importTranslation = async (files) => {
        for (const file of files) {
            const name = file.name;
            const type = name.replace(/\.json$/, "");

            if (!Object.keys(this.modules).includes(type)) {
                Notifier.notify({
                    title: "宝可梦点击（Poke Clicker）内核汉化脚本",
                    message: `导入本地汉化json失败\n不支持的文件名：${name}`,
                    timeout: 6000000,
                });
                continue;
            }

            await new Promise((resolve) => {
                const fr = new FileReader();
                fr.readAsText(file);
                fr.addEventListener("loadend", () => {
                    const result = JSON.parse(fr.result);
                    localStorage.setItem(`PokeClickerHelper-Translation-${type}`, JSON.stringify(result));
                    localStorage.setItem(`PokeClickerHelper-Translation-${type}-lastModified`, Date.now().toString());
                    console.log("PokeClickerHelper-Translation", "本地导入json", type);
                    Notifier.notify({
                        title: "宝可梦点击（Poke Clicker）内核汉化脚本",
                        message: `导入本地汉化json成功\n刷新游戏后生效：${name}`,
                        type: 1,
                        timeout: 6000000,
                    });
                    resolve();
                });
            });
        }
    };

    #finish() {
        setTimeout(() => $('.toast:contains("汉化正在加载中") [data-dismiss="toast"]').trigger("click"), 1000);

        if (this.#failed.length === 0) {
            Notifier.notify({
                title: "宝可梦点击（Poke Clicker）内核汉化脚本",
                message: `汉化加载完毕\n可以正常加载存档\n\n<div class="d-flex" style="justify-content: space-around;"><button class="btn btn-block btn-info m-0 col-5" onclick="window.TranslationHelper.ForceRefreshTranslation()">清空汉化缓存</button><button class="btn btn-block btn-info m-0 col-5" onclick="window.TranslationHelper.ImportAction()">本地导入汉化</button></div>`,
                timeout: 15000,
            });
        } else {
            Notifier.notify({
                title: "宝可梦点击（Poke Clicker）内核汉化脚本",
                message: `请求汉化json失败，请检查网络链接或更新脚本\n无法完成汉化：${this.#failed.join(" / ")}\n\n<div class="d-flex" style="justify-content: space-around;"><button class="btn btn-block btn-info m-0 col-5" onclick="window.TranslationHelper.ForceRefreshTranslation()">清空汉化缓存</button><button class="btn btn-block btn-info m-0 col-5" onclick="window.TranslationHelper.ImportAction()">本地导入汉化</button></div>`,
                timeout: 6000000,
            });
        }
    }

    ImportAction = () => {
        const that = this;
        $(`<input type="file" accept=".json" style="display:none;" multiple />`)
            .appendTo(document.body)
            .on("change", function () {
                that.TranslationHelper.ImportTranslation(this.files);
                this.remove();
            })
            .on("cancel", function () {
                this.remove();
            })
            .trigger("click");
    };

    ForceRefreshTranslation = (refresh = true) => {
        Object.values(this.modules).forEach((module) => {
            const resource = module.name;
            localStorage.removeItem(`PokeClickerHelper-Translation-${resource}`);
            localStorage.removeItem(`PokeClickerHelper-Translation-${resource}-lastModified`);
        });
        refresh && location.reload();
    };

    TranslationHelper = {
        config: this.config,
        Translation: this.Translation,
        ExportTranslation: this.ExportTranslation,
        ImportTranslation: this.importTranslation,
        ImportAction: this.ImportAction,
        ForceRefreshTranslation: this.ForceRefreshTranslation,
    };
}

class BaseModule {
    core = null;
    disabled = false;

    name = "";
    displayName = "";
    translation = [];

    injectCore(core) {
        this.core = core;
        this.translation.forEach((translation) => (this.core.Translation[translation] = {}));
    }

    init() {
        throw new Error(`[${this.name}] 模块未实现 init() 方法`);
    }
}

class TownModule extends BaseModule {
    name = "Town";
    displayName = "城镇";
    translation = ["Town"];

    init() {
        this.#parser();
        this.#hook();
    }
    #parser = () => {
        this.core.Translation.Town = JSON.parse(this.core.TranslationCache.Town);
    };
    #hook() {
        Object.values(TownList).forEach((t) => {
            t.displayName = this.core.Translation.Town[t.name] ?? t.name;
        });

        $('[data-bind="text: player.town.name"]').attr(
            "data-bind",
            "text: player.town[TranslationHelper.toggleRaw ? 'name' : 'displayName']"
        );

        $("[data-town]").each((_, element) => {
            const name = $(element).attr("data-town");
            $(element).attr("data-town", this.core.Translation.Town[name] ?? name);
        });

        GameController.realShowMapTooltip = GameController.showMapTooltip;
        GameController.showMapTooltip = (tooltipText) => {
            const translationTown = this.core.TranslationHelper.toggleRaw
                ? tooltipText
                : (this.core.Translation.Town[tooltipText] ?? tooltipText);
            return GameController.realShowMapTooltip(translationTown);
        };
    }

    exportData = () => {
        this.core.TranslationHelper.exporting = true;
        const json = Object.fromEntries(
            Object.keys(TownList).map((townName) => [townName, this.core.Translation.Town[townName] ?? ""])
        );
        this.core.TranslationHelper.exporting = false;
        return json;
    };
}

class QuestLineModule extends BaseModule {
    name = "QuestLine";
    displayName = "任务线";
    translation = ["QuestLine"];

    init() {
        this.parser();
        this.#hook();
    }
    parser = () => {
        const formatter = this.core.config.Formatter;
        const defaultFormatter = this.core.defaultConfig.Formatter;
        const string =
            formatter == defaultFormatter
                ? this.core.TranslationCache.QuestLine
                : this.core.TranslationCache.QuestLine.replace(new RegExp(defaultFormatter, "g"), formatter);
        this.core.Translation.QuestLine = JSON.parse(string);
    };
    #hook() {
        QuestLine.prototype.realAddQuest = QuestLine.prototype.addQuest;

        QuestLine.prototype.addQuest = new Proxy(QuestLine.prototype.realAddQuest, {
            apply: (target, questline, [quest]) => {
                const name = questline.name;
                const translation = this.core.Translation.QuestLine[name];

                if (translation) {
                    const description = quest.description;
                    const displayDescription = translation.descriptions[description];

                    if (displayDescription) {
                        Object.defineProperty(quest, "description", {
                            get: () =>
                                this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw
                                    ? description
                                    : displayDescription,
                        });
                    }
                    if (quest instanceof MultipleQuestsQuest) {
                        quest.quests.forEach((q) => {
                            const qDesc = q.description;
                            const qDisplayDesc = translation.descriptions[qDesc];
                            if (qDisplayDesc) {
                                Object.defineProperty(q, "description", {
                                    get: () =>
                                        this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw
                                            ? qDesc
                                            : qDisplayDesc,
                                });
                            }
                        });
                    }
                }
                return Reflect.apply(target, questline, [quest]);
            },
        });

        window.realQuestLine = QuestLine;
        window.QuestLine = new Proxy(window.realQuestLine, {
            construct: (target, args) => {
                const questline = Reflect.construct(target, args);
                const { name, description } = questline;
                const translation = this.core.Translation.QuestLine[name];

                const displayName = translation?.name;
                const displayDescription = translation?.description[description];

                Object.defineProperty(questline, "displayName", {
                    get: () =>
                        this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw
                            ? name
                            : (displayName ?? name),
                });

                if (displayDescription) {
                    Object.defineProperty(questline, "description", {
                        get: () =>
                            this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw
                                ? description
                                : displayDescription,
                    });
                }

                return questline;
            },
        });

        $("#questLineDisplayBody knockout[data-bind='text: $data.name']").attr(
            "data-bind",
            "text: $data[TranslationHelper.toggleRaw ? 'name' : 'displayName']"
        );
        $("#bulletinBoardModal div.modal-body h5[data-bind='text: $data.name']").attr(
            "data-bind",
            "text: $data[TranslationHelper.toggleRaw ? 'name' : 'displayName']"
        );
        $('#questsModalQuestLinesPane knockout.font-weight-bold.d-block[data-bind="text: $data.name"]').each(function () {
            this.dataset.bind = "text: $data[TranslationHelper.toggleRaw ? 'name' : 'displayName']";
        });
    }

    exportData = () => {
        this.core.TranslationHelper.exporting = true;
        const json = App.game.quests.questLines().reduce((obj, questline) => {
            const { name, _description } = questline;
            const translation = this.core.Translation.QuestLine[name];

            const subObj = {
                name: translation?.name ?? "",
                description: { [_description]: translation?.description[_description] ?? "" },
                descriptions: questline.quests().reduce((d, q) => {
                    const description = q.customDescription ?? q.description;
                    d[description] = translation?.descriptions[description] ?? "";
                    if (q instanceof MultipleQuestsQuest) {
                        q.quests.forEach((qq) => {
                            const qqDesc = qq.customDescription ?? qq.description;
                            d[qqDesc] = translation?.descriptions[qqDesc] ?? "";
                        });
                    }
                    return d;
                }, {}),
            };

            obj[name] = subObj;
            return obj;
        }, {});
        this.core.TranslationHelper.exporting = false;
        return json;
    };
}

class NPCModule extends BaseModule {
    name = "NPC";
    displayName = "NPC";
    translation = ["NPC", "NPCName", "NPCDialog"];

    init() {
        this.parser();
        this.#hook();
    }
    parser = () => {
        const formatter = this.core.config.Formatter;
        const defaultFormatter = this.core.defaultConfig.Formatter;
        const string =
            formatter == defaultFormatter
                ? this.core.TranslationCache.NPC
                : this.core.TranslationCache.NPC.replace(new RegExp(defaultFormatter, "g"), formatter);
        this.core.Translation.NPC = JSON.parse(string);
        this.core.Translation.NPCName = this.core.Translation.NPC.NPCName ?? {};
        this.core.Translation.NPCDialog = this.core.Translation.NPC.NPCDialog ?? {};
    };
    #hook() {
        Object.values(TownList)
            .flatMap((i) => i.npcs)
            .forEach((npc) => {
                if (!npc || Object.hasOwn(npc, "rawDialog")) {
                    return;
                }

                npc.displayName = this.core.Translation.NPCName[npc.name] ?? npc.name;
                npc.rawDialog = npc.dialog;
                npc.translatedDialog = npc.rawDialog?.map((d) => this.core.Translation.NPCDialog[d] ?? d);
                delete npc.dialog;
            });

        const that = this;
        Object.defineProperty(NPC.prototype, "dialog", {
            get() {
                return that.core.TranslationHelper.toggleRaw ? this.rawDialog : this.translatedDialog;
            },
        });

        $("#townView button[data-bind='text: $data.name, click: () => NPCController.openDialog($data)']").each(function () {
            this.dataset.bind =
                "text: $data[TranslationHelper.toggleRaw ? 'name' : 'displayName'], click: () => NPCController.openDialog($data)";
        });
        $("#npc-modal h5").each(function () {
            this.dataset.bind = "text: $data[TranslationHelper.toggleRaw ? 'name' : 'displayName']";
        });

        this.core.TranslationHelper.ExportTranslation.NPC_format = this.NPC_format;
    }

    NPC_format = () => {
        const toggleRaw = this.core.TranslationHelper.toggleRaw;
        this.core.TranslationHelper.toggleRaw = true;

        const json = Object.values(TownList).reduce((obj, town) => {
            const npcs = town.npcs;
            if (npcs?.length > 0) {
                obj[town.name] = npcs.map((npc) => {
                    const subObj = { name: { [npc.name]: this.core.Translation.NPCName[npc.name] ?? "" } };
                    if (npc.dialog?.length > 0) {
                        subObj.dialog = Object.fromEntries(npc.dialog.map((d) => [d, this.core.Translation.NPCDialog[d] ?? ""]));
                    }
                    return subObj;
                });
            }
            return obj;
        }, {});

        this.core.TranslationHelper.toggleRaw = toggleRaw;
        return json;
    };

    exportData = (override) => {
        const NPC_format_data = override || this.NPC_format();
        const NPCDialog = Object.assign(
            {},
            ...Object.values(NPC_format_data)
                .flat()
                .map((i) => i.dialog)
                .filter(Boolean)
        );
        const NPCName = Object.assign(
            {},
            ...Object.values(NPC_format_data)
                .flat()
                .map((i) => i.name)
                .filter(Boolean)
        );
        return { NPCName, NPCDialog };
    };
}

class AchievementModule extends BaseModule {
    name = "Achievement";
    displayName = "成就";
    translation = ["Achievement", "AchievementName", "AchievementDescription", "AchievementHint"];

    init() {
        this.#parser();
        this.#hook();
    }
    #parser = () => {
        this.core.Translation.Achievement = JSON.parse(this.core.TranslationCache.Achievement);
        this.core.Translation.AchievementName = this.core.Translation.Achievement.name ?? {};
        this.core.Translation.AchievementDescription = this.core.Translation.Achievement.description ?? {};
        this.core.Translation.AchievementHint = this.core.Translation.Achievement.hint ?? {};

        this.core.Translation.AchievementNameRegs = Object.entries(this.core.Translation.Achievement.nameReg ?? {}).map(
            ([reg, value]) => [new RegExp(reg), value]
        );
        this.core.Translation.AchievementDescriptionRegs = Object.entries(
            this.core.Translation.Achievement.descriptionReg ?? {}
        ).map(([reg, value]) => [new RegExp(reg), value]);
    };
    #hook() {
        window.realAchievement = Achievement;
        window.Achievement = new Proxy(window.realAchievement, {
            construct: (target, args) => {
                const achievement = Reflect.construct(target, args);
                const { name, _description } = achievement;

                const displayName = this.formatAchievement(name, "Name");
                const displayDescription = this.formatAchievement(_description, "Description");

                Object.defineProperties(achievement, {
                    name: {
                        get: () =>
                            this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw ? name : displayName,
                    },
                    _description: {
                        get: () =>
                            this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw
                                ? _description
                                : displayDescription,
                    },
                    rawName: { get: () => name },
                });
                return achievement;
            },
        });

        window.realSecretAchievement = SecretAchievement;
        window.SecretAchievement = new Proxy(window.realSecretAchievement, {
            construct: (target, args) => {
                const achievement = Reflect.construct(target, args);
                const { name, _description, _hint } = achievement;

                const displayName = this.formatAchievement(name, "Name");
                const displayDescription = this.formatAchievement(_description, "Description");
                const displayHint = this.formatAchievement(_hint, "Hint");

                Object.defineProperties(achievement, {
                    name: {
                        get: () =>
                            this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw ? name : displayName,
                    },
                    _description: {
                        get: () =>
                            this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw
                                ? _description
                                : displayDescription,
                    },
                    _hint: {
                        get: () =>
                            this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw ? _hint : displayHint,
                    },
                    rawName: { get: () => name },
                });
                return achievement;
            },
        });

        AchievementHandler.findByName = function (name) {
            return AchievementHandler.achievementList.find(
                (achievement) => achievement.rawName === name && achievement.achievable()
            );
        };
        AchievementTracker.prototype.toJSON = function () {
            return {
                trackedAchievementName: this.hasTrackedAchievement() ? this.trackedAchievement().rawName : null,
            };
        };
        AchievementHandler.toJSON = function () {
            // Saves only achievements which have already been completed but currently don't have their requirements met, or that have the persist flag set
            const storage = AchievementHandler.achievementList
                .filter((a) => a.unlocked() && (a.persist || !a.property.isCompleted()))
                .map((a) => a.rawName || a.name);
            return storage;
        };
    }

    formatAchievement = (text, type) => {
        const raw = this.core.Translation[`Achievement${type}`][text];
        if (raw) {
            return raw;
        }

        const [reg, value] = this.core.Translation[`Achievement${type}Regs`].find(([reg]) => reg.test(text)) ?? [];
        if (reg) {
            return this.formatRegex(text, reg, value);
        }

        return text;
    };

    formatRegex(text, reg, value) {
        const methods = {
            Town: (i) => this.core.Translation.Town[i],
            Region: (i) => this.core.Translation.Region[i],
            RegionFull: (i) => this.core.Translation.RegionFull[i],
            SubRegion: (i) => this.core.Translation.SubRegion[i],
            Route: (i) => this.core.modules.Route.formatRouteName?.(i, false),
            GymFormat: (i) => i.replace(/^ /, ""),
            GymFormatRegion: (i) => {
                if (Object.keys(this.core.Translation.Region).length == 0) {
                    return i;
                }
                const GymRegionReg = new RegExp(`^${Object.keys(this.core.Translation.Region).join("|")}`);
                return i.replace(GymRegionReg, (m) => this.core.Translation.Region[m] ?? m);
            },
        };

        return text.replace(reg, (...args) => {
            const groups = args.slice(1, -2);
            return value
                .replace(/#([\w/]+)\{\$(\d)}/g, (_, matcher, n) => {
                    const group = groups[n - 1];
                    const formatters = matcher.split("/").map((method) => methods[method]);
                    const formatter = formatters.find((fromatter) => fromatter(group));
                    return formatter?.(group) ?? group;
                })
                .replace(/\$(\d)/g, (_, n) => groups[n - 1] ?? "");
        });
    }
}

class RegionModule extends BaseModule {
    name = "Regions";
    displayName = "地区";
    translation = ["Regions", "Region", "RegionFull", "SubRegion"];

    init() {
        this.#parser();
        this.#hook();
    }
    #parser = () => {
        this.core.Translation.Regions = JSON.parse(this.core.TranslationCache.Regions);
        this.core.Translation.Region = this.core.Translation.Regions.Region ?? {};
        this.core.Translation.RegionFull = Object.fromEntries(
            Object.entries(this.core.Translation.Region).map(([region, name]) => [region, `${name}地区`])
        );
        this.core.Translation.SubRegion = Object.assign(
            this.core.Translation.Regions.SubRegion ?? {},
            this.core.Translation.RegionFull
        );

        Object.assign(this.core.Translation.Region, { "Sevii Islands": "七之岛" });
    };
    #hook() {
        $("[href='#mapBody'] > span").attr(
            "data-bind",
            "text: `城镇地图 (${TranslationHelper.Translation.RegionFull[GameConstants.camelCaseToString(GameConstants.Region[player.region])]})`"
        );
        $("#subregion-travel-buttons > button.btn.btn-sm.btn-primary").attr(
            "data-bind",
            "click: () => SubRegions.openModal(), text: `副区域旅行 (${TranslationHelper.Translation.SubRegion[player.subregionObject()?.name]})`"
        );
    }
}

class RouteModule extends BaseModule {
    name = "Route";
    displayName = "道路";
    translation = ["Route"];

    #regionRouteReg = new RegExp(`^MISSING_REGION$`);
    #waterRoute = {
        Kanto: [19, 20, 21],
        Johto: [40, 41],
        Hoenn: [105, 106, 107, 109, 109, 122, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134],
        Sinnoh: [220, 223, 226, 230],
        Unova: [17, 21],
        Alola: [15],
    };

    init() {
        this.#parser();
        this.#hook();
    }
    #parser = () => {
        this.core.Translation.Route = JSON.parse(this.core.TranslationCache.Route);
    };
    #hook() {
        if (Object.keys(this.core.Translation.Region).length > 0) {
            this.#regionRouteReg = new RegExp(`^(${Object.keys(this.core.Translation.Region).join("|")}) Route (\\d+)$`);
        }

        Routes.real_getName = Routes.getName;
        Routes.getName = (route, region, alwaysIncludeRegionName = false, includeSubRegionName = false) => {
            if (this.core.TranslationHelper.exporting) {
                return Routes.real_getName.call(Routes, route, region, alwaysIncludeRegionName, includeSubRegionName);
            }

            const rawRegionName = GameConstants.camelCaseToString(GameConstants.Region[region]);
            const regionName = this.core.Translation.Region[rawRegionName] ?? rawRegionName;
            const regionFullName = this.core.Translation.RegionFull[rawRegionName] ?? rawRegionName;

            const resultRoute = Routes.regionRoutes.find(
                (routeData) => routeData.region === region && routeData.number === route
            );
            let routeName = this.formatRouteName(resultRoute?.routeName) ?? "Unknown Route";

            if (alwaysIncludeRegionName && !routeName.includes(regionName)) {
                routeName = `${regionFullName}-${routeName}`;
            } else if (includeSubRegionName && resultRoute) {
                const subRegionName =
                    this.core.Translation.SubRegion[SubRegions.getSubRegionById(region, resultRoute.subRegion ?? 0).name] ??
                    "Unknown SubRegion";
                if (!routeName.includes(subRegionName)) {
                    routeName = `${subRegionName}-${routeName}`;
                }
            }
            return routeName;
        };
    }

    formatRouteName = (routeName, returnRaw = true) => {
        if (this.core.Translation.Route[routeName]) {
            return this.core.Translation.Route[routeName];
        }

        if (this.#regionRouteReg.test(routeName)) {
            return routeName.replace(this.#regionRouteReg, (match, region, number) => {
                const regionName = this.core.Translation.Region[region] ?? region;
                const formatNumber = number.replace(/\d/g, (digit) => String.fromCharCode(digit.charCodeAt(0) + 0xff10 - 0x30));
                const routeType = this.#waterRoute[region]?.includes(+number) ? "水路" : "道路";
                return `${regionName}${formatNumber}号${routeType}`;
            });
        }
        return returnRaw ? routeName : undefined;
    };

    exportData = () => {
        this.core.TranslationHelper.exporting = true;
        const json = Routes.regionRoutes.reduce((obj, { routeName }) => {
            if (this.#regionRouteReg.test(routeName)) {
                return obj;
            }
            obj[routeName] = this.formatRouteName(routeName, false) ?? "";
            return obj;
        }, {});
        this.core.TranslationHelper.exporting = false;
        return json;
    };
}

class GymModule extends BaseModule {
    name = "Gym";
    displayName = "道馆";
    translation = ["Gym"];

    init() {
        this.parser();
        this.#hook();
    }
    parser = () => {
        const formatter = this.core.config.Formatter;
        const defaultFormatter = this.core.defaultConfig.Formatter;
        const string =
            formatter == defaultFormatter
                ? this.core.TranslationCache.Gym
                : this.core.TranslationCache.Gym.replace(new RegExp(defaultFormatter, "g"), formatter);
        this.core.Translation.Gym = JSON.parse(string);
    };
    #hook() {
        Object.values(GymList).forEach((gym) => {
            const rawLeaderName = gym.leaderName;
            const leaderName = this.core.Translation.Gym[rawLeaderName] ?? rawLeaderName;
            const rawButtonText = gym.buttonText;

            const buttonText =
                gym.buttonText === rawLeaderName.replace(/\d/, "") + "'s Gym"
                    ? leaderName.replace(/\d/, "") + "的道馆"
                    : (this.core.Translation.Gym[rawButtonText] ?? rawButtonText);

            Object.defineProperties(gym, {
                leaderName: {
                    get: () =>
                        this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw
                            ? rawLeaderName
                            : leaderName,
                },
                buttonText: {
                    get: () =>
                        this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw
                            ? rawButtonText
                            : buttonText,
                },
                displayName: {
                    get: () =>
                        this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw
                            ? rawButtonText
                            : buttonText,
                },
                rawButtonText: { get: () => rawButtonText },
                rawLeaderName: { get: () => rawLeaderName },
            });
        });

        Object.defineProperty(Gym.prototype, "imagePath", {
            get() {
                return `assets/images/npcs/${this.imageName ?? this.rawLeaderName}.png`;
            },
        });
    }

    exportData = () => {
        this.core.TranslationHelper.exporting = true;
        const json = {};
        Object.values(GymList).forEach((gym) => {
            json[gym.rawLeaderName] = this.core.Translation.Gym[gym.rawLeaderName] ?? "";
            if (!gym.rawButtonText.endsWith("'s Gym")) {
                json[gym.rawButtonText] = this.core.Translation.Gym[gym.rawButtonText] ?? "";
            }
        });
        this.core.TranslationHelper.exporting = false;
        return json;
    };
}

class UIModule extends BaseModule {
    name = "UI";

    init() {
        this.#hook();
    }
    #hook() {
        const CoreModule = this.core.CoreModule;
        if (!CoreModule) {
            return;
        }

        const prefix = CoreModule.UIContainerID[0].replace("#", "").replace("Container", "") + "TranslationHelper";

        CoreModule.TranslationAPI = {
            Route: this.core.modules.Route.formatRouteName ?? ((i) => i),
            Town: (townName) => this.core.Translation.Town[townName] ?? townName,
            Region: (region) => {
                if (typeof region === "string") {
                    return this.core.Translation.SubRegion[region] ?? region;
                }
                if (typeof region === "number") {
                    const regionName = GameConstants.camelCaseToString(GameConstants.Region[region]);
                    return this.core.Translation.SubRegion[regionName] ?? regionName;
                }
            },
            NPC: (npcName) => this.core.Translation.NPCName[npcName] ?? npcName,
            QuestLine: (questLineName) => this.core.Translation.QuestLine[questLineName]?.name ?? questLineName,
            Gym: (leaderName) => this.core.Translation.Gym[leaderName] ?? leaderName,
            Achievement: (achievementName) => this.core.Translation.AchievementName[achievementName] ?? achievementName,
        };

        const switchHTML = Object.values(this.core.modules).reduce((str, module) => {
            if (!module.displayName) {
                return str;
            }
            return (
                str +
                `<label class="form-check-label ml-4 mr-1 mb-2">
                    <input id="${prefix}Switch${module.name}" type="checkbox" value="true" checked data-save="global">
                    ${module.displayName}
                </label>` +
                "\n"
            );
        }, "");
        CoreModule.UIDOM.push(`
            <div id="${prefix}" class="custom-row">
                <div class="contentLabel"><label>内核汉化</label></div>
                <div style="flex: auto;">
                    <button id="${prefix}Refresh" class="btn btn-sm btn-primary mr-1" data-save="false" title="刷新游戏后强制请求汉化json&#10;*仅清空脚本缓存，可能存在浏览器缓存需手动清理">清空缓存</button>
                    <button id="${prefix}Import" class="btn btn-sm btn-primary mr-1" data-save="false" title="导入本地汉化文件覆盖汉化缓存">导入汉化</button>
                    <button id="${prefix}Toggle" class="btn btn-sm btn-primary mr-1" data-save="false" value="切换原文" title="">切换原文</button>
                </div>
                <div class="contentContainer d-flex ml-2 mt-2" style="flex: auto;align-items: center;flex-wrap: wrap;">
                    <div class="m-auto d-flex" style="align-items: baseline; width: 100%;">
                        <label>CDN</label>
                        <select id="${prefix}CDN" title="选择任一可连通CDN即可" data-save="global" class="custom-select m-2" style="width: 67%; text-align: center;">
                            <option value="jsDelivr">cdn.jsdelivr.net</option>
                            <option value="GitHub">raw.githubusercontent.com</option>
                        </select>
                        <button id="${prefix}Test" class="btn btn-sm btn-primary" data-save="false" title="测试CDN连通情况">测试</button>
                    </div>
                    <div class="mt-2 m-auto d-flex">
                        <div class="form-floating" style="width: 30%;">
                            <input type="number" class="form-control" id="${prefix}UpdateDelay" data-save="global" step="1" value="${this.core.TranslationHelper.config.UpdateDelay}" style="text-align: right; height: 45px;">
                            <label style="padding-right: 0!important; padding-top: 12px!important; font-size: 12px;">更新周期（天）</label>
                        </div>
                        <div class="form-floating ml-3" style="width: 32%;">
                            <input type="number" class="form-control" id="${prefix}Timeout" data-save="global" step="100" value="${this.core.TranslationHelper.config.Timeout}" min="3000" style="text-align: right; height: 45px;">
                            <label style="padding-right: 0!important; padding-top: 12px!important; font-size: 12px;">请求超时（毫秒）</label>
                        </div>
                        <div id="${prefix}TestResult" style="margin: auto; width: 30%; text-align: center; color: blue;">
                            测试结果：未测试
                        </div>
                    </div>
                </div>
                <div id="${prefix}Setting" class="mt-3" style="flex: auto; height: 16px; width: 100%">
                    <span style="position: relative; display: block; text-align: center; width: 150px; border: black 1px solid; height: 1px; margin: 5px auto;">
                    </span>
                    <span style="position: relative; display: block; text-align: center; height: 16px; margin: auto; top: -15px; background: #fff; width: 70px;">
                        ▼汉化范围
                    </span>
                </div>
                <div id="${prefix}Switch" class="mt-2 d-none AdvanceTable-T" style="flex: auto;" title="若取消勾选则不再下载与注入相关汉化内容（刷新后生效）">
                    <div style="width: 70%">
                        ${switchHTML}
                    </div>
                    <div class="form-floating" style="width: 30%; margin-top: -0.35rem;">
                        <select type="number" class="form-select"
                            id="${prefix}SwitchSeparator" data-save="global" 
                            style="text-align: center;height: 45px; font-size: 12px; width: 80%; opacity: 0.7; padding-left: 5px; padding-top: 1.2rem; padding-bottom: 0;"
                            title="适用于部分宝可梦/NPC/道馆联盟名称分隔符号"
                            >
                            <option value="·" selected >
                                圆点
                            </option>
                            <option value=" ">
                                空格
                            </option>
                            <option value="\u2002">
                                半角空格
                            </option>
                            <option value="\u2003">
                                全角空格
                            </option>
                            <option value="\u2009">
                                窄空格
                            </option>
                            <option value="">
                                无
                            </option>
                        </select>
                        <label style="padding-right: 0!important; padding-top: 12px!important; font-size: 10px; transform: scale(.85) translateY(-.5rem) translateX(-.2rem); opacity: 0.7;">
                            分隔符号
                        </label>
                    </div>
                </div>
            </div>
            `);

        CoreModule.UIstyle.push(`
            #PokeClickerHelperTranslationHelper .AdvanceTable-T {
                flex: auto !important;
                display: flex;
                flex-wrap: wrap !important;
                align-content: center !important;
                align-items: center !important;
                padding: 0 5px !important;;
            }
            /*
            #PokeClickerHelperTranslationHelper .AdvanceTable-T .AdvanceOption-T {
                height: 36px !important;
                width: 15% !important;
                display: flex !important;
                align-items: center !important;
            }

            #PokeClickerHelperTranslationHelper .AdvanceTable-T .AdvanceOption-T div {
                width: 100% !important;
                text-align: center !important;
            }

            #PokeClickerHelperTranslationHelper .AdvanceTable-T .AdvanceOption-T input {
                width: 25% !important;
            }*/
        `);

        CoreModule.UIlistener.push(() => {
            const that = this;
            $(`#${prefix}`)
                .on("click", `#${prefix}Refresh`, function () {
                    this.disabled = true;
                    that.core.TranslationHelper.ForceRefreshTranslation(false);
                })
                .on("click", `#${prefix}Toggle`, function (e) {
                    const target = e.currentTarget;
                    if (target.value === "切换原文") {
                        $(target).text((target.value = "切换汉化"));
                        that.core.TranslationHelper.toggleRaw = true;
                    } else {
                        $(target).text((target.value = "切换原文"));
                        that.core.TranslationHelper.toggleRaw = false;
                    }
                    if ($("#npc-modal").is(":visible")) {
                        NPCController.selectedNPC(NPCController.selectedNPC());
                    }
                })
                .on("click", `#${prefix}Import`, function () {
                    that.core.ImportAction();
                })
                .on("change", "[data-save=global]", function () {
                    const id = this.id.replace(prefix, "");
                    if (id == "SwitchSeparator") {
                        that.core.config.Formatter = this.value;
                        that.core.parserSubcribers.forEach((parser) => parser());
                    } else if (this.value !== "") {
                        that.core.TranslationHelper.config[id] = this.value;
                    }
                })
                .on("click", `#${prefix}Test`, async function (e) {
                    const target = e.currentTarget;
                    target.disabled = true;
                    const start = Date.now();

                    const result = await that.core
                        .fetchResource("Town", true)
                        .then(() => `测试结果：成功<br>${Date.now() - start}ms`)
                        .catch(() => `测试结果：超时<br>不够科学`);

                    target.disabled = false;
                    $(`#${prefix}TestResult`).html(result);
                })
                .on("click", `#${prefix}Setting`, function () {
                    const hidden = $(`#${prefix}Switch`).toggleClass("d-none").hasClass("d-none");
                    $(this)
                        .find("span:last")
                        .text(`${hidden ? "▼" : "▲"}汉化范围`);
                });
        });
    }
}

class PokemonModule extends BaseModule {
    name = "Pokemon";
    displayName = "宝可梦";
    translation = ["Pokemon"];
    #cache = new Map();
    #update = ko.observable(0);

    init = () => {
        this.parser();
        this.#hook();
    };

    parser = () => {
        const formatter = this.core.config.Formatter;
        const defaultFormatter = this.core.defaultConfig.Formatter;
        const string =
            formatter == defaultFormatter
                ? this.core.TranslationCache.Pokemon
                : this.core.TranslationCache.Pokemon.replace(new RegExp(defaultFormatter, "g"), formatter);
        this.core.Translation.Pokemon = JSON.parse(string);
        GameHelper.incrementObservable(this.#update);
    };

    #hook() {
        const descriptors = Object.getOwnPropertyDescriptors(PokemonHelper);
        descriptors.displayName.get = () => (englishName) => {
            if (!englishName) {
                return englishName;
            }
            if (this.#cache.has(englishName)) {
                return this.#cache.get(englishName);
            }
            const pureComputed‌ = ko.pureComputed(() => {
                this.#update();
                return this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw
                    ? englishName
                    : (this.core.Translation.Pokemon[englishName] ?? englishName);
            });
            this.#cache.set(englishName, pureComputed‌);
            return pureComputed‌;
        };
        window.PokemonHelper = Object.defineProperties({}, descriptors);
    }

    exportData = () => {
        this.core.TranslationHelper.exporting = true;
        const json = Object.fromEntries(pokemonMap.map((p) => [p.name, this.core.Translation.Pokemon[p.name] ?? ""]));
        this.core.TranslationHelper.exporting = false;
        return json;
    };
}

const Core = new TranslationCore();

Core.registerModule(new PokemonModule());
Core.registerModule(new RegionModule());
Core.registerModule(new RouteModule());
Core.registerModule(new TownModule());
Core.registerModule(new NPCModule());
Core.registerModule(new GymModule());
Core.registerModule(new QuestLineModule());
Core.registerModule(new AchievementModule());

Core.registerModule(new UIModule());

Core.start();
window.TranslationCore = Core;
