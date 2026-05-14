// ==UserScript==
// @name         宝可梦点击（Poke Clicker）内核汉化脚本
// @namespace    PokeClickerHelper
// @version      0.10.25-h
// @description  采用内核汉化形式，目前汉化范围：所有任务线、NPC、成就、地区、城镇、道路、道馆、宝可梦、道具
// @author       DreamNya, ICEYe, iktsuarpok, 我是谁？, 顶不住了, 银☆星, TerVoid
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
   PokemonHelper, pokemonMap, PokeballItem, PokemonType, ItemList, UndergroundItemValueType, UndergroundItem, KeyItem
*/

class TranslationCore {
    Translation = {};
    TranslationCache = {};
    TranslationAPI = {
        // 循环嵌套汉化 // TODO 暂未使用
        format: (rawText) => {
            return rawText.replace(/\{\{(.*?)\}\}/g, (_, matcher) => {
                const [api, raw] = matcher.split("#");
                if (!(api in this.TranslationAPI)) {
                    throw new Error(`[TranslationAPI Error] 未知api ${api}`);
                }
                return this.TranslationAPI[api](raw);
            });
        },
    };
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

    ExportTranslation = {};

    constructor() {
        this.#init();
    }

    #init() {
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
            title: "宝可梦点击内核汉化脚本",
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
            // 对json进行简单压缩
            const minifiedText = JSON.stringify(JSON.parse(text));
            localStorage.setItem(`PokeClickerHelper-Translation-${resource}`, minifiedText);
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
                    title: "宝可梦点击内核汉化脚本",
                    message: `导入本地汉化json失败\n不支持的文件名：${name}`,
                    timeout: 6000000,
                });
                continue;
            }

            await new Promise((resolve) => {
                const fr = new FileReader();
                fr.readAsText(file);
                fr.addEventListener("loadend", () => {
                    try {
                        const result = JSON.parse(fr.result);
                        localStorage.setItem(`PokeClickerHelper-Translation-${type}`, JSON.stringify(result));
                        localStorage.setItem(`PokeClickerHelper-Translation-${type}-lastModified`, Date.now().toString());
                        console.log("PokeClickerHelper-Translation", "本地导入json", type);
                        Notifier.notify({
                            title: "宝可梦点击内核汉化脚本",
                            message: `导入本地汉化json成功\n刷新游戏后生效：${name}`,
                            type: 1,
                            timeout: 6000000,
                        });
                    } catch (err) {
                        Notifier.notify({
                            title: "宝可梦点击内核汉化脚本",
                            message: `导入本地汉化json失败\n${err.message}`,
                            type: 0,
                            timeout: 6000000,
                        });
                    }
                    resolve();
                });
            });
        }
    };

    #finish() {
        setTimeout(() => $('.toast:contains("汉化正在加载中") [data-dismiss="toast"]').trigger("click"), 1000);

        if (this.#failed.length === 0) {
            Notifier.notify({
                title: "宝可梦点击内核汉化脚本",
                message: `汉化加载完毕\n可以正常加载存档\n\n<div class="d-flex" style="justify-content: space-around;"><button class="btn btn-block btn-info m-0 col-5" onclick="window.TranslationHelper.ForceRefreshTranslation()">清空汉化缓存</button><button class="btn btn-block btn-info m-0 col-5" onclick="window.TranslationHelper.ImportAction()">本地导入汉化</button></div>`,
                timeout: 15000,
            });
        } else {
            Notifier.notify({
                title: "宝可梦点击内核汉化脚本",
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
        exporting: false,
        _toggleRaw: ko.observable(false).extend({ boolean: null }),
        get toggleRaw() {
            return this._toggleRaw();
        },
        set toggleRaw(newValue) {
            this._toggleRaw(newValue);
        },

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
    translationAPI = {};

    injectCore(core) {
        this.core = core;
        this.translation.forEach((translation) => (this.core.Translation[translation] = {}));
        Object.assign(this.core.TranslationAPI, this.translationAPI);
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
    #parser() {
        this.core.Translation.Town = JSON.parse(this.core.TranslationCache.Town);
    }

    translationAPI = {
        Town: (townName) => {
            if (this.disabled) {
                return townName;
            }
            return this.core.Translation.Town[townName] ?? townName;
        },
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

    translationAPI = {
        QuestLine: (questLineName) => {
            if (this.disabled) {
                return questLineName;
            }
            return this.core.Translation.QuestLine[questLineName]?.name ?? questLineName;
        },
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

        QuestLine = new Proxy(QuestLine, {
            construct: (target, args) => {
                const questline = Reflect.construct(target, args);
                const { name, _description } = questline;
                const translation = this.core.Translation.QuestLine[name];

                const displayName = translation?.name;
                const displayDescription = translation?.description[_description];

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
                                ? _description
                                : displayDescription,
                    });
                }

                return questline;
            },
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

    translationAPI = {
        NPC: (npcName) => {
            if (this.disabled) {
                return npcName;
            }
            return this.core.Translation.NPCName[npcName] ?? npcName;
        },
    };

    #hook() {
        Object.values(TownList)
            .flatMap((i) => i.npcs)
            .forEach((npc) => {
                if (!npc || Object.hasOwn(npc, "rawDialog")) {
                    return;
                }
                Object.defineProperty(npc, "displayName", {
                    get: () => this.core.Translation.NPCName[npc.name] ?? npc.name,
                });
                npc.rawDialog = npc.dialog;
                npc.translatedDialog = npc.rawDialog?.map((d) => this.core.Translation.NPCDialog[d] ?? d);
                delete npc.dialog;
            });

        const that = this;
        Object.defineProperty(NPC.prototype, "dialog", {
            get() {
                return that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw
                    ? this.rawDialog
                    : this.translatedDialog;
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
        this.core.TranslationHelper.exporting = true;
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

        this.core.TranslationHelper.exporting = false;
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

    // 增加结果缓存避免大量正则开销
    #cache = new Map();

    init() {
        this.#parser();
        this.#hook();
    }

    parser = () => {
        // Achievement.json中不存在分隔符，不需要热重载整个json
        this.#cache.clear();
    };
    #parser() {
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
    }

    translationAPI = {
        /* Achievement: (achievementName) => {
            if (this.disabled) {
                return achievementName;
            }
            return this.core.Translation.AchievementName[achievementName] ?? achievementName;
        }, */
    };

    #hook() {
        // TODO 目前成在游戏加载后动态生成，因此会读取到汉化道馆/联盟文本，导致生成的成就原文包含部分汉化内容、分隔符

        window.realAchievement = Achievement;
        window.Achievement = new Proxy(window.realAchievement, {
            construct: (target, args) => {
                const achievement = Reflect.construct(target, args);
                const { name, _description } = achievement;

                Object.defineProperties(achievement, {
                    name: {
                        get: () =>
                            this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw
                                ? name
                                : this.formatAchievement(name, "Name"),
                    },
                    _description: {
                        get: () =>
                            this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw
                                ? _description
                                : this.formatAchievement(_description, "Description"),
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

                Object.defineProperties(achievement, {
                    name: {
                        get: () =>
                            this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw
                                ? name
                                : this.formatAchievement(name, "Name"),
                    },
                    _description: {
                        get: () =>
                            this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw
                                ? _description
                                : this.formatAchievement(_description, "Description"),
                    },
                    _hint: {
                        get: () =>
                            this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw
                                ? _hint
                                : this.formatAchievement(_hint, "Hint"),
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

    formatAchievement(text, type) {
        const raw = this.core.Translation[`Achievement${type}`][text];
        if (raw) {
            return raw;
        }
        if (this.#cache.has(text)) {
            return this.#cache.get(text);
        }

        const [reg, value] = this.core.Translation[`Achievement${type}Regs`].find(([reg]) => reg.test(text)) ?? [];
        const result = reg ? this.formatRegex(text, reg, value) : text;
        this.#cache.set(text, result);
        return result;
    }

    formatRegex(text, reg, value) {
        // TODO 解耦 目前游戏内含有2000多个成就，默认只读取10个，不会一次性读取全部成就 性能损失在可接受范围内
        const methods = {
            Town: (i) => this.core.TranslationAPI.Town(i),
            Region: (i) => this.core.TranslationAPI.Region(i),
            RegionFull: (i) => this.core.TranslationAPI.RegionFull(i),
            SubRegion: (i) => this.core.TranslationAPI.SubRegion(i),
            RegionAll: (i) => this.core.TranslationAPI.RegionAll(i),
            Route: (i) => this.core.TranslationAPI.Route(i, false),
            GymFormat: (i) => i.replace(/^ /, ""),
            GymFormatRegion: (i) => {
                if (this.core.modules.Regions.disabled) {
                    return i;
                }
                const GymRegionReg = new RegExp(`^${Object.keys(this.core.Translation.RegionAll).join("|")}`);
                return i.replace(GymRegionReg, (m) => this.core.TranslationAPI.RegionAll(m));
            },
        };

        const result = text.replace(reg, (...args) => {
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

        // TODO 参考#hook中注释，实际分隔符在text中传入，因此需要在结果完成后动态替换分隔符
        const formatter = this.core.config.Formatter;
        const defaultFormatter = this.core.defaultConfig.Formatter;
        return formatter == defaultFormatter ? result : result.replace(new RegExp(defaultFormatter, "g"), formatter);
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
    #parser() {
        this.core.Translation.Regions = JSON.parse(this.core.TranslationCache.Regions);
        this.core.Translation.Region = this.core.Translation.Regions.Region ?? {};
        this.core.Translation.RegionFull = Object.fromEntries(
            Object.entries(this.core.Translation.Region).map(([region, name]) => [region, `${name}地区`])
        );
        this.core.Translation.SubRegion = this.core.Translation.Regions.SubRegion;
        this.core.Translation.RegionAll = Object.assign({}, this.core.Translation.RegionFull, this.core.Translation.SubRegion);
    }

    translationAPI = {
        Region: (region) => {
            if (this.disabled) {
                return region;
            }
            if (typeof region === "string") {
                return this.core.Translation.Region[region] ?? region;
            }
            if (typeof region === "number") {
                const regionName = GameConstants.camelCaseToString(GameConstants.Region[region]);
                return this.core.Translation.Region[regionName] ?? regionName;
            }
        },
        RegionFull: (region) => {
            if (this.disabled) {
                return region;
            }
            if (typeof region === "string") {
                return this.core.Translation.RegionFull[region] ?? region;
            }
            if (typeof region === "number") {
                const regionName = GameConstants.camelCaseToString(GameConstants.Region[region]);
                return this.core.Translation.RegionFull[regionName] ?? regionName;
            }
        },
        SubRegion: (subregion) => {
            if (this.disabled) {
                return subregion;
            }
            return this.core.Translation.SubRegion[subregion] ?? subregion;
        },
        RegionAll: (regionName) => {
            if (this.disabled) {
                return regionName;
            }
            return this.core.Translation.RegionAll[regionName] ?? regionName;
        },
    };

    #hook() {
        $("[href='#mapBody'] > span").attr(
            "data-bind",
            "text: `城镇地图 (${TranslationHelper.Translation.RegionFull[GameConstants.camelCaseToString(GameConstants.Region[player.region])]})`"
        );
        $("#subregion-travel-buttons > button.btn.btn-sm.btn-primary").attr(
            "data-bind",
            "click: () => SubRegions.openModal(), text: `副区域旅行 (${TranslationHelper.Translation.RegionAll[player.subregionObject()?.name]})`"
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
    #parser() {
        this.core.Translation.Route = JSON.parse(this.core.TranslationCache.Route);
    }

    translationAPI = {
        Route: (...args) => this.formatRouteName(...args),
    };

    #hook() {
        if (Object.keys(this.core.Translation.Region).length > 0) {
            this.#regionRouteReg = new RegExp(`^(${Object.keys(this.core.Translation.Region).join("|")})? ?Route (\\d+)$`);
        }

        Routes.real_getName = Routes.getName;
        Routes.getName = (route, region, alwaysIncludeRegionName = false, includeSubRegionName = false) => {
            if (this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw) {
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
        if (this.disabled) {
            return routeName;
        }
        if (this.core.Translation.Route[routeName]) {
            return this.core.Translation.Route[routeName];
        }

        if (this.#regionRouteReg.test(routeName)) {
            return routeName.replace(this.#regionRouteReg, (match, region, number) => {
                const regionName = this.core.Translation.Region[region] ?? region ?? "";
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

    translationAPI = {
        Gym: (leaderName) => {
            if (this.disabled) {
                return leaderName;
            }
            return this.core.Translation.Gym[leaderName] ?? leaderName;
        },
    };

    #hook() {
        Object.values(GymList).forEach((gym) => {
            const rawLeaderName = gym.leaderName;
            const leaderName = this.core.Translation.Gym[rawLeaderName] ?? rawLeaderName;
            const rawButtonText = gym.buttonText;

            const buttonText = () =>
                rawButtonText === rawLeaderName.replace(/\d/, "") + "'s Gym"
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
                            : buttonText(),
                },
                displayName: {
                    get: () =>
                        this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw
                            ? rawButtonText
                            : buttonText(),
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

        CoreModule.TranslationAPI = this.core.TranslationAPI;

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
                        if (!that.core.TranslationHelper.toggleRaw) {
                            that.core.TranslationHelper.toggleRaw = true;
                            that.core.TranslationHelper.toggleRaw = false;
                        }
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
    };

    translationAPI = {
        Pokemon: (pokemon) => {
            if (this.disabled) {
                return pokemon;
            }
            return this.core.Translation.Pokemon[pokemon] ?? pokemon;
        },
        PokemonDisplayName: (englishName) => {
            if (!englishName) {
                return englishName;
            }
            if (this.#cache.has(englishName)) {
                return this.#cache.get(englishName);
            }
            const pureComputed‌ = ko.pureComputed(() => {
                return this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw
                    ? englishName
                    : (this.core.Translation.Pokemon[englishName] ?? englishName);
            });
            this.#cache.set(englishName, pureComputed‌);
            return pureComputed‌;
        },
    };

    #hook() {
        App.translation.realGet = App.translation.get;
        App.translation.get = (...args) => {
            if (args[1] == "pokemon") {
                const [englishName] = args;
                return this.translationAPI.PokemonDisplayName(englishName);
            } else {
                return App.translation.realGet(...args);
            }
        };
    }

    exportData = () => {
        this.core.TranslationHelper.exporting = true;
        const json = Object.fromEntries(pokemonMap.map((p) => [p.name, this.core.Translation.Pokemon[p.name] ?? ""]));
        this.core.TranslationHelper.exporting = false;
        return json;
    };
}

class ItemModule extends BaseModule {
    name = "Item";
    displayName = "道具";
    translation = ["Item", "ItemName", "ItemDescription", "KeyItem"];
    #desMapper = {
        // TODO
        BerryItem: (item) => `获取一个 ${item.berryName}<br/><i>(仅限无高级道具挑战模式)</i>`,
        BuyKeyItem: () => "",
        FluteItem: (item) => {
            item.getDescription = function () {
                // TODO
                return `+${(this.getMultiplier() - 1).toLocaleString("en-US", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${this.description} 加成`;
            };
            return "";
        },
        // TODO
        PokeBlock: (item) => item._description || "Unobtainable item for future uses",
        MegaStoneItem: (item) => {
            const description = item._description || `一块${this.core.TranslationAPI.Pokemon(item.basePokemon)}的Mega进化石`;
            item.getDescription = () => {
                return this.core.Translation.ItemDescription[description] ?? description;
            };
            return () => description;
        },
        TreasureItem: (item) => {
            Object.defineProperty(item, "image", {
                get() {
                    return `assets/images/${this.valueType === UndergroundItemValueType.Fossil ? "breeding" : "items/underground"}/${this.rawDisplayName}.png`;
                },
            });

            return `从地下矿场挖掘而出的${this.translationAPI.Item(item.displayName || item.name)}`;
        },
        PokemonItem: (item) => () => `获得宝可梦 ${this.core.TranslationAPI.Pokemon(item.type)}`,
        ZCrystalItem: (item) => {
            const type = GameConstants.zCrystalItemType.indexOf(item.name);
            // TODO
            return `允许 ${PokemonType[type]}属性宝可梦在下场战斗中使用Ｚ招式。接着，他们需要稍微休息一下`;
        },
    };

    init = () => {
        this.parser();
        this.#hook();
    };

    parser = () => {
        const formatter = this.core.config.Formatter;
        const defaultFormatter = this.core.defaultConfig.Formatter;
        const string =
            formatter == defaultFormatter
                ? this.core.TranslationCache.Item
                : this.core.TranslationCache.Item.replace(new RegExp(defaultFormatter, "g"), formatter);
        this.core.Translation.Item = JSON.parse(string);
        this.core.Translation.ItemName = this.core.Translation.Item.ItemName ?? {};
        this.core.Translation.ItemDescription = this.core.Translation.Item.ItemDescription ?? {};
        this.core.Translation.KeyItem = this.core.Translation.Item.KeyItem ?? {};
    };

    translationAPI = {
        get Item() {
            return this.ItemName;
        },
        ItemName: (itemName) => {
            if (this.disabled) {
                return itemName;
            }
            return this.core.Translation.ItemName[itemName] ?? itemName;
        },
        ItemDescription: (itemDescription) => {
            if (this.disabled) {
                return itemDescription;
            }
            return this.core.Translation.ItemDescription[itemDescription] ?? itemDescription;
        },
        KeyItem: (keyItemString) => {
            if (this.disabled) {
                return keyItemString;
            }
            return this.core.Translation.KeyItem[keyItemString] ?? keyItemString;
        },
    };

    #hook() {
        const that = this;
        // KeyItem
        Object.defineProperties(KeyItem.prototype, {
            displayName: {
                get() {
                    return that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw
                        ? this.rawDisplayName
                        : that.translationAPI.KeyItem(this.rawDisplayName);
                },
                set(rawDisplayName) {
                    this.rawDisplayName = rawDisplayName;
                },
            },
            description: {
                get() {
                    return that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw
                        ? this.rawDescription
                        : that.translationAPI.KeyItem(this.rawDescription);
                },
                set(rawDescription) {
                    this.rawDescription = rawDescription;
                },
            },
        });

        // PokeballItem 兼容大师球
        Object.defineProperties(PokeballItem.prototype, {
            displayName: {
                get() {
                    return that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw
                        ? this._displayName
                        : that.translationAPI.Item(this._displayName);
                },
            },
            description: {
                get() {
                    return that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw
                        ? this._description
                        : that.translationAPI.ItemDescription(this._description);
                },
            },
        });

        // TreasureItem
        //delete UndergroundItem.prototype.name;
        Object.defineProperty(UndergroundItem.prototype, "name", {
            get() {
                return (
                    ItemList[this.itemName]?.rawDisplayName ||
                    GameConstants.camelCaseToString(GameConstants.humanifyString(this.itemName))
                );
            },
        });

        // MegaStoneItem
        $('#itemBag-megaStones div[data-bind="text: GameConstants.humanifyString($data.name)"]').attr(
            "data-bind",
            "text: $data.displayName"
        );

        // 农场UI
        $("#mulchList span[data-bind=\"text: MulchType[$data].replace('_', ' ')\"]").attr(
            "data-bind",
            "text: ItemList[MulchType[$data]].displayName"
        );
        $("#shovelList > li > span:nth-child(2)").text(this.translationAPI.Item("Berry Shovel"));
        $("#shovelMulch > li > span:nth-child(2)").text(this.translationAPI.Item("Mulch Shovel"));

        // Item
        Object.values(ItemList).forEach((item) => {
            const type = item.constructor.name;
            const rawDisplayName = item.displayName;
            const rawDescription = type == "BuyKeyItem" ? "" : item.description;
            // proxyDescription包含副作用 //TODO 解耦
            const proxyDescription = type in this.#desMapper ? this.#desMapper[type](item) : "";
            const specialDescription = proxyDescription
                ? typeof proxyDescription == "function"
                    ? proxyDescription
                    : () => proxyDescription
                : null;

            Object.defineProperties(item, {
                rawDisplayName: {
                    get: () => rawDisplayName,
                },
                displayName: {
                    get: () => {
                        return this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw
                            ? rawDisplayName
                            : this.translationAPI.Item(rawDisplayName);
                    },
                },
                ...(type != "BuyKeyItem" && {
                    description: {
                        get: () => {
                            return this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw
                                ? rawDescription
                                : specialDescription?.() || this.translationAPI.ItemDescription(rawDescription);
                        },
                    },
                }),
            });
        });
    }

    exportData = () => {
        this.core.TranslationHelper.exporting = true;
        const displayName = Object.values(ItemList).reduce((obj, i) => {
            const filters = ["PokemonItem"];
            const type = i.constructor.name;
            if (!filters.includes(type)) {
                obj[i.displayName] = this.core.Translation.ItemName[i.displayName] ?? "";
            }
            return obj;
        }, {});

        const description = Object.values(ItemList).reduce((obj, i) => {
            const type = i.constructor.name;
            if (!(type in this.#desMapper)) {
                obj[i.description] = this.core.Translation.ItemDescription[i.description] ?? "";
            }
            return obj;
        }, {});

        const keyItem = App.game.keyItems.itemList.reduce((obj, i) => {
            obj[i.displayName] = this.core.Translation.KeyItem[i.displayName] ?? "";
            obj[i.description] = this.core.Translation.KeyItem[i.description] ?? "";
            return obj;
        }, {});
        const json = {
            ItemName: displayName,
            ItemDescription: description,
            KeyItem: keyItem,
        };
        this.core.TranslationHelper.exporting = false;
        return json;
    };
}

const Core = new TranslationCore();

Core.registerModule(new PokemonModule());
Core.registerModule(new ItemModule());
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
