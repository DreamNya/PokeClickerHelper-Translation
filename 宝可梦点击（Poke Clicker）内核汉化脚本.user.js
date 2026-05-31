// ==UserScript==
// @name         宝可梦点击（Poke Clicker）内核汉化脚本
// @namespace    PokeClickerHelper
// @version      0.10.25-m
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

/* global 
   TownList, QuestLine:true, Notifier, MultipleQuestsQuest, App, NPC, NPCController, GameController, ko,
   GameConstants, SubRegions, Routes, GymList, Gym, Achievement, SecretAchievement, AchievementHandler, AchievementTracker,
   pokemonMap, PokeballItem, PokemonType, ItemList, UndergroundItemValueType, UndergroundItem, KeyItem, TemporaryBattleList, TemporaryBattle,
   FluteEffectRunner, OakItem, OakItemType, QuestHelper, BerryType, GameHelper, BadgeEnums, GameLoadState, Quest, Town, MoveToDungeon
*/

/**
 * * 汉化核心控制器
 * * * 负责生命周期管理、JSON资源拉取缓存、以及模块调度
 */
class TranslationCore {
    /** @type {Record<string, string>} 存储从 CDN 或 localStorage 获取的 JSON 文本 */
    TranslationCache = {};

    /**
     * * 所有汉化 API 集合
     * * * BaseModule 实例化时，将内部的 translationAPI 注册到此处，并暴露给全局调用
     * @type {Record<string, Function>}
     */
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

    /** @type {Set<Function>} 存储需要响应 分隔符热重载的模块方法 */
    parserSubcribers = new Set();

    /**
     * 所有子模块集合
     * @type {{
     * [M in typeof MODULES_LIST[number] as M['moduleName']]: InstanceType<M>
     * } & Record<string, BaseModule>}
     */
    modules = {};

    /** @type {string[]} 记录获取失败的资源名称 */
    #failed = [];

    /** @type {number} 脚本启动时间戳 */
    #now = Date.now();

    /** @type {Object} PokeClickerHelper核心模块对象 */
    CoreModule = window.PokeClickerHelper ?? window.PokeClickerHelperPlus;

    /** @type {Object} CDN 地址配置 */
    CDN = {
        jsDelivr: "https://cdn.jsdelivr.net/gh/DreamNya/PokeClickerHelper-Translation@main/json/",
        GitHub: "https://raw.githubusercontent.com/DreamNya/PokeClickerHelper-Translation/main/json/",
    };

    /**
     * @typedef {Object} TranslationConfig
     * @property {("jsDelivr"|"GitHub")} CDN - 当前使用的 CDN 线路
     * @property {number} UpdateDelay - 资源更新周期（天），负数表示强制更新
     * @property {number} Timeout - 请求超时时间（毫秒）
     * @property {string} Formatter - 词缀分隔符，如 "·", " ", ""
     */

    /** @type {TranslationConfig} 默认配置 */
    defaultConfig = {
        CDN: "jsDelivr",
        UpdateDelay: 30, // days
        Timeout: 10000, // ms
        Formatter: "·",
    };

    /** @type {TranslationConfig} 用户配置 */
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

    /** @type {Record<string, Function>} 所有模块的导出方法 */
    ExportTranslation = {};

    constructor() {
        this.#init();
    }

    /** @private 初始化全局入口 */
    #init() {
        window.TranslationHelper = this.TranslationHelper;
        if (this.CoreModule) {
            this.CoreModule.TranslationHelper = this.TranslationHelper;
        }
    }

    /**
     * 注册子模块
     * @param {BaseModule} module 继承自 BaseModule 的子模块实例
     */
    registerModule(module) {
        module.injectCore(this);
        const moduleName = module.name;
        this.modules[moduleName] = module;
        const enabled = this.CoreModule?.get(`TranslationHelperSwitch${moduleName}`, true, true) ?? true;
        if (!enabled) {
            module.disabled = true;
        }
    }

    /** 正式初始化所有子模块，并尝试获取 JSON 资源 */
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
            const moduleName = module.name;
            if (module.pullResource) {
                await this.#pullResource(moduleName);
            }
            if (module.disabled) {
                continue;
            }
            try {
                module.init();
                if (module.exportData) {
                    this.TranslationHelper.ExportTranslation[moduleName] = module.exportData;
                }
                if (module.parser) {
                    this.parserSubcribers.add(module.parser);
                }
            } catch (e) {
                console.error(`[汉化模块加载失败]: ${moduleName}`, e);
            }
        }

        this.#finish();
    }

    /**
     * 获取 JSON 资源，失败时尝试从 localStorage 恢复
     * @private
     * @param {string} resource 资源名（与模块名相同） // TODO
     */
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

    /**
     * 包含手动缓存策略的 JSON 请求方法
     * @private
     * @param {string} resource
     * @param {boolean} [force=false] 是否强制忽略缓存
     * @returns {Promise<string>}
     */
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

    /**
     * * 公开的 CDN 测试方法
     * * * 从远程拉取一个文件大小最大的 JSON 文件以获得准确的测试结果
     * @public
     */
    fetchTest() {
        return this.#fetchResource("NPC", true);
    }

    /** 从本地文件导入翻译 JSON */
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

    /** @private 完成所有模块加载后的通知逻辑 */
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
        GameLoadState.onLoadState(
            GameLoadState.states.running,
            () => {
                this.TranslationHelper.toggleRaw = false;
            },
            true
        );
    }

    /** 从文件选择框导入翻译 */
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

    /**
     * 清空所有汉化缓存
     * @param {boolean} [refresh=true] 清空完成后是否刷新页面
     */
    ForceRefreshTranslation = (refresh = true) => {
        Object.values(this.modules).forEach((module) => {
            const resource = module.name;
            localStorage.removeItem(`PokeClickerHelper-Translation-${resource}`);
            localStorage.removeItem(`PokeClickerHelper-Translation-${resource}-lastModified`);
        });
        refresh && location.reload();
    };

    /**
     * 暴露给全局的 TranslationHelper 对象，包含 UI 交互方法和配置
     * @type {Object}
     */
    TranslationHelper = {
        exporting: false,
        _toggleRaw: ko.observable(true).extend({ boolean: null }),
        get toggleRaw() {
            return this._toggleRaw();
        },
        set toggleRaw(newValue) {
            this._toggleRaw(newValue);
        },

        config: this.config,
        TranslationAPI: this.TranslationAPI,
        ExportTranslation: this.ExportTranslation,
        ImportTranslation: this.importTranslation,
        ImportAction: this.ImportAction,
        ForceRefreshTranslation: this.ForceRefreshTranslation,
    };
}

/**
 * * 汉化模块基类
 * * * 定义模块生命周期和公共工具方法
 * @abstract
 */
class BaseModule {
    /** @type {TranslationCore} 核心控制器引用 */
    core = null;

    /** @type {boolean} 模块是否被用户禁用 */
    disabled = false;

    /**
     * 模块标识名称，用于注册和存储标识 （需与 CDN 上的 JSON 文件名一致 //TODO）
     * @readonly
     */
    static moduleName = "";

    /**
     * 获取当前模块的实例标识名称
     * @type {string}
     */
    get name() {
        return this.constructor.moduleName;
    }

    /** @type {string} 模块展示名称，用于 UI 面板显示 */
    displayName = "";

    /**
     * 暴露给全局 TranslationAPI 的方法集合
     * @type {Record<string, Function>}
     */
    translationAPI = {};

    /** @type {boolean} 是否远程请求资源 */
    pullResource = true;

    /**
     * 框架生命周期钩子：注入核心实例，并将当前模块 API 注册到全局。
     * @param {TranslationCore} core
     */
    injectCore(core) {
        this.core = core;
        Object.assign(this.core.TranslationAPI, this.translationAPI);
    }

    /**
     * * 核心工具方法：从缓存中解析 JSON，可选替换分隔符
     * * * 子类应在 `#parser / parser` 阶段调用此方法初始化 `#dict`。
     * @param {string} resourceKey 资源键名
     * @param {boolean} [applyFormatter=false] 是否热重载分隔符
     * @returns {Object} 解析后的 JSON 对象
     */
    parseResource(resourceKey, applyFormatter = false) {
        let string = this.core.TranslationCache[resourceKey];
        if (!string) {
            return {};
        }

        if (applyFormatter) {
            const formatter = this.core.config.Formatter;
            const defaultFormatter = this.core.defaultConfig.Formatter;
            if (formatter !== defaultFormatter) {
                string = string.replace(new RegExp(defaultFormatter, "g"), formatter);
            }
        }
        return JSON.parse(string);
    }

    /**
     * * 框架生命周期钩子：模块初始化入口。
     * * * 子类必须实现此方法，通常在此处调用 `#parser()` 和 `#hook()`。
     * @abstract
     */
    init() {
        throw new Error(`[${this.name}] 模块未实现 init() 方法`);
    }
}

class TownModule extends BaseModule {
    /** @readonly */
    static moduleName = "Town";
    displayName = "城镇";
    #dict = { Town: {} };

    init() {
        this.#parser();
        this.#hook();
    }
    #parser() {
        this.#dict.Town = this.parseResource("Town", false);
    }

    translationAPI = {
        Town: (townName, fallback = townName) => {
            if (this.disabled) {
                return townName;
            }
            return this.#dict.Town[townName] ?? fallback;
        },
    };

    #hook() {
        const that = this;
        Object.defineProperty(Town.prototype, "displayName", {
            get() {
                return that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw
                    ? this.name
                    : that.translationAPI.Town(this.name);
            },
        });
        $('[data-bind="text: player.town.name"]').attr("data-bind", "text: player.town.displayName");

        /* $("[data-town]").each((_, element) => {
            const name = $(element).attr("data-town");
            $(element).attr("data-town", this.translationAPI.Town(name));
        }); */

        GameController.realShowMapTooltip = GameController.showMapTooltip;
        GameController.showMapTooltip = (tooltipText) => {
            const translationTown = this.core.TranslationHelper.toggleRaw
                ? tooltipText
                : (this.translationAPI.Town(tooltipText, null) ??
                  // 兼容临时对战的tooltip
                  // TODO 解耦
                  this.core.modules.TemporaryBattle.translationAPI.TemporaryBattleName(tooltipText));
            return GameController.realShowMapTooltip(translationTown);
        };

        MoveToDungeon.prototype.text = function () {
            return this.dungeon.displayName;
        };
    }

    exportData = () => {
        this.core.TranslationHelper.exporting = true;
        const json = Object.fromEntries(
            Object.keys(TownList).map((townName) => [townName, this.translationAPI.Town(townName, "")])
        );
        this.core.TranslationHelper.exporting = false;
        return json;
    };
}

class QuestLineModule extends BaseModule {
    /** @readonly */
    static moduleName = "QuestLine";
    displayName = "任务线";
    #dict = { QuestLine: {} };

    init() {
        this.parser();
        this.#hook();
    }
    parser = () => {
        this.#dict.QuestLine = this.parseResource("QuestLine", true);
    };

    translationAPI = {
        QuestLine: (questLineName) => {
            if (this.disabled) {
                return undefined;
            }
            return this.#dict.QuestLine[questLineName];
        },
        QuestLineName: (questLineName, fallback = questLineName) => {
            if (this.disabled) {
                return questLineName;
            }
            return this.#dict.QuestLine[questLineName]?.name ?? fallback;
        },
        QuestLineDescription: (questlineName, description, fallback = description) => {
            if (this.disabled) {
                return description;
            }
            return this.#dict.QuestLine[questlineName]?.description?.[description] ?? fallback;
        },
        QuestDescription: (questlineName, questDescription, fallback = questDescription) => {
            if (this.disabled) {
                return questDescription;
            }
            return this.#dict.QuestLine[questlineName]?.descriptions?.[questDescription] ?? fallback;
        },
        QuestClearedMessage: (questlineName, clearedMessage, fallback = clearedMessage) => {
            if (this.disabled) {
                return clearedMessage;
            }
            return this.#dict.QuestLine[questlineName]?.clearedMessage?.[clearedMessage] ?? fallback;
        },
        QuestNpcDisplayName: (questlineName, npcDisplayName, fallback = npcDisplayName) => {
            if (this.disabled) {
                return npcDisplayName;
            }
            return this.#dict.QuestLine[questlineName]?.npcDisplayName?.[npcDisplayName] ?? fallback;
        },
    };

    // 公开的静态方法，用于QuestModules重复调用
    static QuestPrototypeHook = () => {
        if ("real_description" in Quest.prototype) {
            return;
        }
        const descriptor = Object.getOwnPropertyDescriptor(Quest.prototype, "description");
        Object.defineProperties(Quest.prototype, {
            real_description: descriptor,
            description: {
                get() {
                    if (this.inQuestLine) {
                        return this.hook_QuestLineModule_description ?? this.real_description;
                    } else {
                        return this.hook_QuestModule_description ?? this.real_description;
                    }
                },
            },
        });
    };
    #hook() {
        QuestLineModule.QuestPrototypeHook();
        const that = this;
        Object.defineProperties(Quest.prototype, {
            hook_QuestLineModule_description: {
                get() {
                    //const description = this.customDescription || this.defaultDescription;
                    return that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw
                        ? this.rawDescription
                        : that.translationAPI.QuestDescription(this.parentQuestLine.name, this.rawDescription);
                },
            },
            getClearedMessage: {
                value() {
                    return that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw
                        ? this.optionalArgs.clearedMessage
                        : that.translationAPI.QuestClearedMessage(this.parentQuestLine.name, this.optionalArgs.clearedMessage);
                },
            },
            getNpcDisplayName: {
                value() {
                    return that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw
                        ? this.optionalArgs.npcDisplayName
                        : that.translationAPI.QuestNpcDisplayName(this.parentQuestLine.name, this.optionalArgs.npcDisplayName);
                },
            },
        });
        // TODO 解耦
        GameLoadState.onLoadState(
            GameLoadState.states.appliedBindings,
            () => {
                App.game.quests
                    .questLines()
                    .flatMap((q) => q.quests())
                    .forEach((quest) => {
                        quest.rawDescription = quest.description;
                        if (quest instanceof MultipleQuestsQuest) {
                            quest.quests.forEach((subQuest) => {
                                subQuest.rawDescription = subQuest.description;
                            });
                        }
                    });
            },
            true
        );

        Object.defineProperties(QuestLine.prototype, {
            displayName: {
                get() {
                    return that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw
                        ? this.name
                        : that.translationAPI.QuestLineName(this.name);
                },
            },
            description: {
                get() {
                    return that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw
                        ? this._description
                        : that.translationAPI.QuestLineDescription(this.name, this._description);
                },
            },
        });
    }

    exportData = () => {
        this.core.TranslationHelper.exporting = true;
        const json = App.game.quests.questLines().reduce((obj, questline) => {
            const { name: questLineName, _description } = questline;
            const translation = this.translationAPI.QuestLine(questLineName);

            const { qDesc, qClear, qNPC } = questline.quests().reduce(
                (obj, quest) => {
                    const description = quest.rawDescription;
                    obj.qDesc[description] = this.translationAPI.QuestDescription(questLineName, description, "");
                    const { clearedMessage, npcDisplayName } = quest.optionalArgs ?? {};
                    if (clearedMessage) {
                        obj.qClear[clearedMessage] = this.translationAPI.QuestClearedMessage(questLineName, clearedMessage, "");
                    }

                    if (npcDisplayName) {
                        obj.qNPC[npcDisplayName] = this.translationAPI.QuestNpcDisplayName(questLineName, npcDisplayName, "");
                    }

                    if (quest instanceof MultipleQuestsQuest) {
                        quest.quests.forEach((qq) => {
                            const qqDesc = qq.rawDescription;
                            obj.qDesc[qqDesc] = this.translationAPI.QuestDescription(questLineName, qqDesc, "");
                        });
                    }
                    return obj;
                },
                { qDesc: {}, qClear: {}, qNPC: {} }
            );
            const subObj = {
                name: translation?.name ?? "",
                description: { [_description]: this.translationAPI.QuestLineDescription(questLineName, _description, "") },
                descriptions: qDesc,
            };
            if (Object.keys(qClear).length) {
                subObj.clearedMessage = qClear;
            }
            if (Object.keys(qNPC).length) {
                subObj.npcDisplayName = qNPC;
            }

            obj[questLineName] = subObj;
            return obj;
        }, {});
        this.core.TranslationHelper.exporting = false;
        return json;
    };
}

class NPCModule extends BaseModule {
    /** @readonly */
    static moduleName = "NPC";
    displayName = "NPC";
    #dict = { NPC: {}, NPCName: {}, NPCDialog: {} };
    #dialogCache = new WeakMap();

    init() {
        this.parser();
        this.#hook();
    }
    parser = () => {
        this.#dict.NPC = this.parseResource("NPC", true);
        this.#dict.NPCName = this.#dict.NPC.NPCName ?? {};
        this.#dict.NPCDialog = this.#dict.NPC.NPCDialog ?? {};
        // 热重载时直接赋值，旧的WeakMap会被自动垃圾回收
        this.#dialogCache = new WeakMap();
    };

    translationAPI = {
        get NPC() {
            return this.NPCName;
        },
        NPCName: (npcName, fallback = npcName) => {
            if (this.disabled) {
                return npcName;
            }
            return this.#dict.NPCName[npcName] ?? fallback;
        },
        NPCDialog: (npcDialog, fallback = npcDialog) => {
            if (this.disabled) {
                return npcDialog;
            }
            return this.#dict.NPCDialog[npcDialog] ?? fallback;
        },
    };

    #hook() {
        Object.values(TownList)
            .flatMap((i) => i.npcs)
            .forEach((npc) => {
                if (!npc || Object.hasOwn(npc, "rawDialog")) {
                    return;
                }
                npc.rawDialog = npc.dialog;
                delete npc.dialog;
            });

        const that = this;
        Object.defineProperties(NPC.prototype, {
            dialog: {
                get() {
                    if (that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw) {
                        return this.rawDialog;
                    }
                    // 使用NPC实例作为WeakMap键
                    if (!that.#dialogCache.has(this)) {
                        const translatedDialog = this.rawDialog?.map((d) => that.translationAPI.NPCDialog(d));
                        that.#dialogCache.set(this, translatedDialog);
                    }

                    return that.#dialogCache.get(this);
                },
            },
            displayName: {
                get() {
                    return that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw
                        ? this.name
                        : that.translationAPI.NPCName(this.name);
                },
            },
        });

        $("#townView button[data-bind='text: $data.name, click: () => NPCController.openDialog($data)']").each(function () {
            this.dataset.bind = "text: $data.displayName, click: () => NPCController.openDialog($data)";
        });
        $("#npc-modal h5").each(function () {
            this.dataset.bind = "text: $data.displayName";
        });

        this.core.TranslationHelper.ExportTranslation.NPC_format = this.NPC_format;
    }

    NPC_format = () => {
        this.core.TranslationHelper.exporting = true;
        const json = Object.values(TownList).reduce((obj, town) => {
            const npcs = town.npcs;
            if (npcs?.length > 0) {
                obj[town.name] = npcs.map((npc) => {
                    const subObj = { name: { [npc.name]: this.translationAPI.NPCName(npc.name, "") } };
                    if (npc.dialog?.length > 0) {
                        subObj.dialog = Object.fromEntries(npc.dialog.map((d) => [d, this.translationAPI.NPCDialog(d, "")]));
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
    /** @readonly */
    static moduleName = "Achievement";
    displayName = "成就";
    #dict = {
        Achievement: {},
        AchievementName: {},
        AchievementDescription: {},
        AchievementHint: {},
        AchievementNameRegs: {},
        AchievementDescriptionRegs: {},
    };

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
        this.#dict.Achievement = this.parseResource("Achievement", false);
        this.#dict.AchievementName = this.#dict.Achievement.name ?? {};
        this.#dict.AchievementDescription = this.#dict.Achievement.description ?? {};
        this.#dict.AchievementHint = this.#dict.Achievement.hint ?? {};

        this.#dict.AchievementNameRegs = Object.entries(this.#dict.Achievement.nameReg ?? {}).map(([reg, value]) => [
            new RegExp(reg),
            value,
        ]);
        this.#dict.AchievementDescriptionRegs = Object.entries(this.#dict.Achievement.descriptionReg ?? {}).map(
            ([reg, value]) => [new RegExp(reg), value]
        );
    }

    translationAPI = {
        get Achievement() {
            return this.AchievementName;
        },
        AchievementName: (name, fallback = name) => {
            if (this.disabled) {
                return name;
            }
            return this.#dict.AchievementName[name] ?? fallback;
        },
        AchievementDescription: (description, fallback = description) => {
            if (this.disabled) {
                return description;
            }
            return this.#dict.AchievementDescription[description] ?? fallback;
        },
        AchievementHint: (hint, fallback = hint) => {
            if (this.disabled) {
                return hint;
            }
            return this.#dict.AchievementHint[hint] ?? fallback;
        },
        AchievementNameRegs: () => {
            if (this.disabled) {
                return [];
            }
            return this.#dict.AchievementNameRegs ?? [];
        },
        AchievementDescriptionRegs: () => {
            if (this.disabled) {
                return [];
            }
            return this.#dict.AchievementDescriptionRegs ?? [];
        },
    };

    #hook() {
        const that = this;
        Object.defineProperties(Achievement.prototype, {
            name: {
                get() {
                    return that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw
                        ? this.rawName
                        : that.formatAchievement(this.rawName, "Name");
                },
                set(newValue) {
                    this.rawName = newValue;
                },
            },
            _description: {
                get() {
                    return that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw
                        ? this.rawDescription
                        : that.formatAchievement(this.rawDescription, "Description");
                },
                set(newValue) {
                    this.rawDescription = newValue;
                },
            },
        });

        Object.defineProperties(SecretAchievement.prototype, {
            _hint: {
                get() {
                    return that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw
                        ? this.rawHint
                        : that.formatAchievement(this.rawHint, "Hint");
                },
                set(newValue) {
                    this.rawHint = newValue;
                },
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
        const raw = this.translationAPI[`Achievement${type}`](text, null);
        if (raw) {
            return raw;
        }
        if (this.#cache.has(text)) {
            return this.#cache.get(text);
        }

        const [reg, value] = this.translationAPI[`Achievement${type}Regs`]().find(([reg]) => reg.test(text)) ?? [];
        const result = reg ? this.#formatRegex(text, reg, value) : text;
        this.#cache.set(text, result);
        return result;
    }

    // TODO 解耦 目前游戏内含有2000多个成就，默认只读取10个，不会一次性读取全部成就 性能损失在可接受范围内
    #regexMethods = {
        Town: (i) => this.core.TranslationAPI.Town(i),
        Region: (i) => this.core.TranslationAPI.Region(i),
        RegionFull: (i) => this.core.TranslationAPI.RegionFull(i),
        SubRegion: (i) => this.core.TranslationAPI.SubRegion(i),
        RegionAll: (i) => this.core.TranslationAPI.RegionAll(i),
        Route: (i) => this.core.TranslationAPI.Route(i, false),
        GymFormat: (i) => this.core.TranslationAPI.GymName(i.trim()),
        GymFormatRegion: (i) => {
            const regionAllKeys = this.core.modules.Regions.translationAPI.GetRegionAllKeys();
            if (regionAllKeys.length == 0) {
                return i;
            }
            const GymRegionReg = new RegExp(`^(${regionAllKeys.join("|")})?(.*)`);
            return i.replace(GymRegionReg, (match, region, gym) => {
                const regionStr = region ? this.core.TranslationAPI.RegionAll(region) : "";
                const gymStr = this.core.TranslationAPI.GymName(gym.trim());
                return regionStr + gymStr;
            });
        },
    };

    #formatRegex(text, reg, value) {
        const result = text.replace(reg, (...args) => {
            const groups = args.slice(1, -2);
            return value
                .replace(/#([\w/]+)\{\$(\d)}/g, (_, matcher, n) => {
                    const group = groups[n - 1];
                    const formatters = matcher.split("/").map((method) => this.#regexMethods[method]);
                    const formatter = formatters.find((fromatter) => fromatter(group));
                    return formatter?.(group) ?? group;
                })
                .replace(/\$(\d)/g, (_, n) => groups[n - 1] ?? "");
        });
        return result;
        /* 
        // TODO 实际分隔符在text中传入，因此需要在结果完成后动态替换分隔符
        const formatter = this.core.config.Formatter;
        const defaultFormatter = this.core.defaultConfig.Formatter;
        return formatter == defaultFormatter ? result : result.replace(new RegExp(defaultFormatter, "g"), formatter); 
        */
    }
}

class RegionsModule extends BaseModule {
    /** @readonly */
    static moduleName = "Regions";
    displayName = "地区";
    #dict = { Regions: {}, Region: {}, RegionFull: {}, SubRegion: {}, RegionAll: {} };

    init() {
        this.#parser();
        this.#hook();
    }
    #parser() {
        this.#dict.Regions = this.parseResource("Regions", false);
        this.#dict.Region = this.#dict.Regions.Region ?? {};
        this.#dict.RegionFull = Object.fromEntries(
            Object.entries(this.#dict.Region).map(([region, name]) => [region, `${name}地区`])
        );
        this.#dict.SubRegion = this.#dict.Regions.SubRegion;
        this.#dict.RegionAll = Object.assign({}, this.#dict.RegionFull, this.#dict.SubRegion);
    }

    translationAPI = {
        Region: (region, fallback = region) => {
            if (this.disabled) {
                return region;
            }
            if (typeof region === "string") {
                return this.#dict.Region[region] ?? fallback;
            }
            if (typeof region === "number") {
                const regionName = GameConstants.camelCaseToString(GameConstants.Region[region]);
                return this.#dict.Region[regionName] ?? (fallback == region ? regionName : fallback);
            }
        },
        RegionFull: (region, fallback = region) => {
            if (this.disabled) {
                return region;
            }
            if (typeof region === "string") {
                return this.#dict.RegionFull[region] ?? fallback;
            }
            if (typeof region === "number") {
                const regionName = GameConstants.camelCaseToString(GameConstants.Region[region]);
                return this.#dict.RegionFull[regionName] ?? (fallback == region ? regionName : fallback);
            }
        },
        SubRegion: (subregion, fallback = subregion) => {
            if (this.disabled) {
                return subregion;
            }
            return this.#dict.SubRegion[subregion] ?? fallback;
        },
        RegionAll: (regionName, fallback = regionName) => {
            if (this.disabled) {
                return regionName;
            }
            return this.#dict.RegionAll[regionName] ?? fallback;
        },
        GetRegionAllKeys: () => {
            if (this.disabled) {
                return [];
            }
            return Object.keys(this.#dict.RegionAll ?? {});
        },
        GetRegionKeys: () => {
            if (this.disabled) {
                return [];
            }
            return Object.keys(this.#dict.Region ?? {});
        },
    };

    #hook() {
        $("[href='#mapBody'] > span").attr(
            "data-bind",
            "text: `城镇地图 (${TranslationHelper.TranslationAPI.RegionFull(GameConstants.camelCaseToString(GameConstants.Region[player.region]))})`"
        );
        $("#subregion-travel-buttons > button.btn.btn-sm.btn-primary").attr(
            "data-bind",
            "click: () => SubRegions.openModal(), text: `副区域旅行 (${TranslationHelper.TranslationAPI.RegionAll(player.subregionObject()?.name)})`"
        );
    }
}

class RouteModule extends BaseModule {
    /** @readonly */
    static moduleName = "Route";
    displayName = "道路";
    #dict = { Route: {} };

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
        this.#dict.Route = this.parseResource("Route", false);
    }

    translationAPI = {
        Route: (routeName, fallback = routeName) => {
            if (this.disabled) {
                return routeName;
            }
            if (this.#dict.Route[routeName]) {
                return this.#dict.Route[routeName];
            }

            if (this.#regionRouteReg.test(routeName)) {
                return routeName.replace(this.#regionRouteReg, (match, region, number) => {
                    const regionName = this.core.TranslationAPI.Region(region ?? "");
                    const formatNumber = number.replace(/\d/g, (digit) =>
                        String.fromCharCode(digit.charCodeAt(0) + 0xff10 - 0x30)
                    );
                    const routeType = this.#waterRoute[region]?.includes(+number) ? "水路" : "道路";
                    return `${regionName}${formatNumber}号${routeType}`;
                });
            }
            return fallback;
        },
    };

    #hook() {
        const regionKeys = this.core.modules.Regions.translationAPI.GetRegionKeys();
        if (regionKeys.length > 0) {
            this.#regionRouteReg = new RegExp(`^(${regionKeys.join("|")})? ?Route (\\d+)$`);
        }

        Routes.real_getName = Routes.getName;
        Routes.getName = (route, region, alwaysIncludeRegionName = false, includeSubRegionName = false) => {
            if (this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw) {
                return Routes.real_getName.call(Routes, route, region, alwaysIncludeRegionName, includeSubRegionName);
            }

            const rawRegionName = GameConstants.camelCaseToString(GameConstants.Region[region]);
            const regionName = this.core.modules.Regions.translationAPI.Region(rawRegionName);
            const regionFullName = this.core.modules.Regions.translationAPI.RegionFull(rawRegionName);

            const resultRoute = Routes.regionRoutes.find(
                (routeData) => routeData.region === region && routeData.number === route
            );
            let routeName = this.translationAPI.Route(resultRoute?.routeName);

            if (alwaysIncludeRegionName && !routeName.includes(regionName)) {
                routeName = `${regionFullName}-${routeName}`;
            } else if (includeSubRegionName && resultRoute) {
                const subRegionName = this.core.modules.Regions.translationAPI.SubRegion(
                    SubRegions.getSubRegionById(region, resultRoute.subRegion ?? 0).name
                );
                if (!routeName.includes(subRegionName)) {
                    routeName = `${subRegionName}-${routeName}`;
                }
            }
            return routeName;
        };
    }

    exportData = () => {
        this.core.TranslationHelper.exporting = true;
        const json = Routes.regionRoutes.reduce((obj, { routeName }) => {
            if (!this.#regionRouteReg.test(routeName)) {
                obj[routeName] = this.translationAPI.Route(routeName, "");
            }
            return obj;
        }, {});
        this.core.TranslationHelper.exporting = false;
        return json;
    };
}

class GymModule extends BaseModule {
    /** @readonly */
    static moduleName = "Gym";
    displayName = "道馆";
    #dict = { Gym: {}, GymLeaderName: {}, GymDefeatMessage: {}, GymBadge: {} };

    init() {
        this.parser();
        this.#hook();
    }
    parser = () => {
        this.#dict.Gym = this.parseResource("Gym", true);
        this.#dict.GymLeaderName = this.#dict.Gym.GymLeaderName ?? {};
        this.#dict.GymDefeatMessage = this.#dict.Gym.GymDefeatMessage ?? {};
        this.#dict.GymBadge = this.#dict.Gym.GymBadge ?? {};
    };

    translationAPI = {
        get Gym() {
            return this.LeaderName;
        },
        GymName: (gymName, fallback = gymName) => {
            if (this.disabled) {
                return gymName;
            }
            if (gymName.endsWith("'s Gym")) {
                const leaderName = gymName.replace(/'s Gym$/, "");
                return this.translationAPI.GymLeaderName(leaderName) + "的道馆";
            } else {
                return this.translationAPI.GymLeaderName(gymName, fallback);
            }
        },
        GymLeaderName: (leaderName, fallback = leaderName) => {
            if (this.disabled) {
                return leaderName;
            }
            return this.#dict.GymLeaderName[leaderName] ?? fallback;
        },
        GymDefeatMessage: (defeatMessage, fallback = defeatMessage) => {
            if (this.disabled) {
                return defeatMessage;
            }
            return this.#dict.GymDefeatMessage[defeatMessage] ?? fallback;
        },
        GymBadge: (badge, fallback = badge) => {
            if (this.disabled) {
                return badge;
            }
            const formattedBadge = badge.replace(/_/g, " ") + (badge.endsWith(" Badge") ? "" : " Badge");
            return this.#dict.GymBadge[formattedBadge] ?? fallback;
        },
    };

    #hook() {
        const that = this;

        document.head.insertAdjacentHTML(
            "beforeend",
            `<style>
                .badgeEntry p::after {
                    content: '';
                }
            </style>`
        );
        // TODO
        window.TranslationBadge = (badge) => {
            return this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw
                ? badge.replace(/_/g, " ")
                : this.translationAPI.GymBadge(badge);
        };
        $(`#badgeCaseModal p[data-bind="text: $data.replace(/_/g, ' ')"]`).attr(
            "data-bind",
            "text: window.TranslationBadge($data)"
        );
        window.TranslationBadgeRegion = (region) => {
            return this.core.TranslationHelper.exporting || this.core.TranslationHelper.toggleRaw
                ? region
                : region == "Orange League"
                  ? "橘子联盟"
                  : this.core.modules.Regions.translationAPI.RegionAll(region);
        };
        $('#badgeCaseModal h4[data-bind="text: $data[0]"]').attr("data-bind", "text: window.TranslationBadgeRegion($data[0])");

        Object.values(GymList).forEach((gym) => {
            gym.rawLeaderName = gym.leaderName;
            gym.rawButtonText = gym.buttonText;
            gym.rawDefeatMessage = gym.defeatMessage;
            delete gym.leaderName;
            delete gym.buttonText;
            delete gym.defeatMessage;
        });

        Object.defineProperties(Gym.prototype, {
            leaderName: {
                get() {
                    return that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw
                        ? this.rawLeaderName
                        : that.translationAPI.GymLeaderName(this.rawLeaderName);
                },
            },
            buttonText: {
                get() {
                    return that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw
                        ? this.rawButtonText
                        : this.displayButtonText;
                },
            },
            displayName: {
                get() {
                    return this.buttonText;
                },
            },
            displayButtonText: {
                get() {
                    return this.rawButtonText === this.rawLeaderName.replace(/\d/, "") + "'s Gym"
                        ? this.leaderName.replace(/\d/, "") + "的道馆"
                        : that.translationAPI.GymLeaderName(this.rawButtonText);
                },
            },
            defeatMessage: {
                get() {
                    return that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw
                        ? this.rawDefeatMessage
                        : that.translationAPI.GymDefeatMessage(this.rawDefeatMessage);
                },
            },
            imagePath: {
                get() {
                    return `assets/images/npcs/${this.imageName ?? this.rawLeaderName}.png`;
                },
            },
        });
    }

    exportData = () => {
        this.core.TranslationHelper.exporting = true;
        const json = Object.values(GymList).reduce(
            (obj, gym) => {
                obj.GymLeaderName[gym.rawLeaderName] = this.translationAPI.GymLeaderName(gym.rawLeaderName, "");
                if (!gym.rawButtonText.endsWith("'s Gym")) {
                    obj.GymLeaderName[gym.rawButtonText] = this.translationAPI.GymLeaderName(gym.rawButtonText, "");
                }
                if (gym.defeatMessage) {
                    obj.GymDefeatMessage[gym.defeatMessage] = this.translationAPI.GymDefeatMessage(gym.defeatMessage, "");
                }
                return obj;
            },
            { GymLeaderName: {}, GymDefeatMessage: {} }
        );
        json.GymBadge = Object.fromEntries(
            GameHelper.enumStrings(BadgeEnums)
                .filter((b) => !b.startsWith("Elite") && b != "None")
                .map((badge) => {
                    const formattedBadge = badge.replace(/_/g, " ") + (badge.endsWith(" Badge") ? "" : " Badge");
                    return [formattedBadge, this.translationAPI.GymBadge(formattedBadge, "")];
                })
        );

        this.core.TranslationHelper.exporting = false;
        return json;
    };
}

class UIModule extends BaseModule {
    /** @readonly */
    static moduleName = "UI";
    pullResource = false;

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
                    <div style="width: 75%">
                        ${switchHTML}
                    </div>
                    <div class="form-floating" style="width: 25%; margin-top: -0.35rem;">
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
                        .fetchTest()
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
    /** @readonly */
    static moduleName = "Pokemon";
    displayName = "宝可梦";
    #cache = new Map();
    #dict = { Pokemon: {} };

    init = () => {
        this.parser();
        this.#hook();
    };

    parser = () => {
        this.#dict.Pokemon = this.parseResource("Pokemon", true);
    };

    translationAPI = {
        Pokemon: (pokemon, fallback = pokemon) => {
            if (this.disabled) {
                return pokemon;
            }
            return this.#dict.Pokemon[pokemon] ?? fallback;
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
                    : this.translationAPI.Pokemon(englishName);
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
        const json = Object.fromEntries(pokemonMap.map((p) => [p.name, this.translationAPI.Pokemon(p.name, "")]));
        this.core.TranslationHelper.exporting = false;
        return json;
    };
}

class ItemModule extends BaseModule {
    /** @readonly */
    static moduleName = "Item";
    displayName = "道具";
    #dict = { Item: {}, ItemName: {}, ItemDescription: {}, KeyItem: {}, OakItem: {}, PokemonType: {} };

    #desMapper = {
        // TODO
        BerryItem: (item) => `获取1个 ${item.berryName}<br/><i>(仅限无高级道具挑战模式)</i>`,
        BuyKeyItem: () => "",
        // TODO
        PokeBlock: (item) => item._description || "Unobtainable item for future uses",
        MegaStoneItem: (item) => {
            const description = item._description || `一块${this.core.TranslationAPI.Pokemon(item.basePokemon)}的Mega进化石`;
            item.getDescription = () => {
                return this.translationAPI.ItemDescription(description);
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
            const typeDisplayName = this.translationAPI.PokemonType(PokemonType[type]);
            return `允许 ${typeDisplayName}属性宝可梦在下场战斗中使用Ｚ招式。接着，他们需要稍微休息一下`;
        },
    };

    init = () => {
        this.parser();
        this.#hook();
    };

    parser = () => {
        this.#dict.Item = this.parseResource("Item", true);
        this.#dict.ItemName = this.#dict.Item.ItemName ?? {};
        this.#dict.ItemDescription = this.#dict.Item.ItemDescription ?? {};
        this.#dict.KeyItem = this.#dict.Item.KeyItem ?? {};
        this.#dict.OakItem = this.#dict.Item.OakItem ?? {};
        this.#dict.PokemonType = this.#dict.Item.PokemonType ?? {};
    };

    translationAPI = {
        get Item() {
            return this.ItemName;
        },
        ItemName: (itemName, fallback = itemName) => {
            if (this.disabled) {
                return itemName;
            }
            return this.#dict.ItemName[itemName] ?? fallback;
        },
        ItemDescription: (itemDescription, fallback = itemDescription) => {
            if (this.disabled) {
                return itemDescription;
            }
            return this.#dict.ItemDescription[itemDescription] ?? fallback;
        },
        KeyItem: (keyItemString, fallback = keyItemString) => {
            if (this.disabled) {
                return keyItemString;
            }
            return this.#dict.KeyItem[keyItemString] ?? fallback;
        },
        OakItem: (oakItemString, fallback = oakItemString) => {
            if (this.disabled) {
                return oakItemString;
            }
            return this.#dict.OakItem[oakItemString] ?? fallback;
        },
        // TODO 暂时将PokemonType放在Item中
        PokemonType: (typeString, fallback = typeString) => {
            if (this.disabled) {
                return typeString;
            }
            return this.#dict.PokemonType[typeString] ?? fallback;
        },
    };

    #hook() {
        const that = this;
        // 通过遍历实例反向查找闭包class
        const FluteItem = Object.values(ItemList).find((i) => i.constructor.name == "FluteItem")?.constructor;
        FluteItem.prototype.getDescription = function () {
            return `+${(this.getMultiplier() - 1).toLocaleString("en-US", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${this.description} 加成`;
        };
        FluteItem.prototype.getFormattedTooltip = function () {
            let tooltipString = "";
            tooltipString += `<div><strong>${this.displayName}</strong></div>`;
            tooltipString += `<div>${this.getDescription()}</div>`;
            tooltipString += `<div>消耗 ${FluteEffectRunner.numActiveFlutes()} 宝石/秒</div>`;
            return tooltipString;
        };

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

        // OakItem
        Object.defineProperties(OakItem.prototype, {
            displayName: {
                get() {
                    return that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw
                        ? this.rawDisplayName
                        : that.translationAPI.OakItem(this.rawDisplayName);
                },
                set(rawDisplayName) {
                    this.rawDisplayName = rawDisplayName;
                },
            },
            description: {
                get() {
                    return that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw
                        ? this.rawDescription
                        : that.translationAPI.OakItem(this.rawDescription);
                },
                set(rawDescription) {
                    this.rawDescription = rawDescription;
                },
            },
        });
        $(
            '#oakItemsModal strong[data-bind="text: GameConstants.humanifyString(OakItemType[OakItemController.inspectedItem])"]'
        ).attr("data-bind", "text: App.game.oakItems.itemList[OakItemController.inspectedItem].displayName");

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
            //const filters = ["PokemonItem"];
            //const type = i.constructor.name;
            //if (!filters.includes(type)) {
            obj[i.displayName] = this.translationAPI.ItemName(i.displayName, "");
            //}
            return obj;
        }, {});

        const description = Object.values(ItemList).reduce((obj, i) => {
            const type = i.constructor.name;
            if (!(type in this.#desMapper)) {
                obj[i.description] = this.translationAPI.ItemDescription(i.description, "");
            }
            return obj;
        }, {});

        const keyItem = App.game.keyItems.itemList.reduce((obj, i) => {
            obj[i.displayName] = this.translationAPI.KeyItem(i.displayName, "");
            obj[i.description] = this.translationAPI.KeyItem(i.description, "");
            return obj;
        }, {});
        const oakItem = App.game.oakItems.itemList.reduce((obj, i) => {
            obj[i.displayName] = this.translationAPI.OakItem(i.displayName, "");
            obj[i.description] = this.translationAPI.OakItem(i.description, "");
            return obj;
        }, {});
        const pokemonType = Object.fromEntries(
            GameHelper.enumStrings(PokemonType).map((type) => [type, this.translationAPI.PokemonType(type, "")])
        );
        const json = {
            ItemName: displayName,
            ItemDescription: description,
            KeyItem: keyItem,
            OakItem: oakItem,
            PokemonType: pokemonType,
        };
        this.core.TranslationHelper.exporting = false;
        return json;
    };
}
class TemporaryBattleModule extends BaseModule {
    /** @readonly */
    static moduleName = "TemporaryBattle";
    displayName = "临时对战";
    #dict = { TemporaryBattle: {}, TemporaryBattleName: {}, TemporaryBattleDefeatMessage: {} };

    init() {
        this.parser();
        this.#hook();
    }
    parser = () => {
        this.#dict.TemporaryBattle = this.parseResource("TemporaryBattle", true);
        this.#dict.TemporaryBattleName = this.#dict.TemporaryBattle.TemporaryBattleName ?? {};
        this.#dict.TemporaryBattleDefeatMessage = this.#dict.TemporaryBattle.TemporaryBattleDefeatMessage ?? {};
    };

    translationAPI = {
        get TemporaryBattle() {
            return this.TemporaryBattleName;
        },
        TemporaryBattleName: (battleName, fallback = battleName) => {
            if (this.disabled) {
                return battleName;
            }
            return this.#dict.TemporaryBattleName[battleName] ?? fallback;
        },
        TemporaryBattleDefeatMessage: (defeatMessage, fallback = defeatMessage) => {
            if (this.disabled) {
                return defeatMessage;
            }
            return this.#dict.TemporaryBattleDefeatMessage[defeatMessage] ?? fallback;
        },
    };

    #hook() {
        Object.values(TemporaryBattleList).forEach((battle) => {
            if (battle.defeatMessage) {
                battle._defeatMessage = battle.defeatMessage;
                delete battle.defeatMessage;
            }
        });

        const that = this;

        TemporaryBattle.prototype.real_getDisplayName = TemporaryBattle.prototype.getDisplayName;
        TemporaryBattle.prototype.getDisplayName = function () {
            const rawDisplayName = this.real_getDisplayName();
            if (that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw) {
                return rawDisplayName;
            } else {
                return that.translationAPI.TemporaryBattleName(rawDisplayName);
            }
        };

        TemporaryBattle.prototype.text = function () {
            const displayName = this.getDisplayName();
            if (that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw) {
                return `Fight ${displayName}`;
            } else {
                return `对战 ${displayName}`;
            }
        };

        Object.defineProperty(TemporaryBattle.prototype, "defeatMessage", {
            get() {
                return that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw
                    ? this._defeatMessage
                    : that.translationAPI.TemporaryBattleDefeatMessage(this._defeatMessage);
            },
        });
    }

    exportData = () => {
        // this.core.TranslationHelper.exporting = true;
        const { TemporaryBattleName, TemporaryBattleDefeatMessage } = Object.values(TemporaryBattleList).reduce(
            (obj, battle) => {
                const battleName = battle.real_getDisplayName();
                const defeatMessage = battle._defeatMessage;
                obj.TemporaryBattleName[battleName] = this.translationAPI.TemporaryBattleName(battleName, "");
                if (defeatMessage) {
                    obj.TemporaryBattleDefeatMessage[defeatMessage] = this.translationAPI.TemporaryBattleDefeatMessage(
                        defeatMessage,
                        ""
                    );
                }
                return obj;
            },
            { TemporaryBattleName: {}, TemporaryBattleDefeatMessage: {} }
        );
        [...document.querySelectorAll('rect[data-bind*="TemporaryBattleList"]')].forEach((rect) => {
            const tooltip = rect.getAttribute("data-bind").match(/GameController\.showMapTooltip\('(.*?)'\)/)?.[1];
            if (tooltip) {
                TemporaryBattleName[tooltip] = this.translationAPI.TemporaryBattleName(tooltip, "");
            }
        });
        // this.core.TranslationHelper.exporting = false
        return { TemporaryBattleName, TemporaryBattleDefeatMessage };
    };
}

class QuestModule extends BaseModule {
    /** @readonly */
    static moduleName = "Quest";
    displayName = "任务";
    // 不适合以json形式翻译，配合AST进行硬编码
    pullResource = false;

    init() {
        this.#hook();
    }
    #hook() {
        QuestLineModule.QuestPrototypeHook();
        const that = this;

        const questLists = {
            DefeatPokemonsQuest: function () {
                const routeName = Routes.getName(this.route, this.region, false, that.core.modules.Route.disabled);
                return `在 ${routeName} 击败 ${this.amount.toLocaleString("en-US")} 只宝可梦`;
            },
            CapturePokemonsQuest: function () {
                return `捕捉或孵化 ${this.amount.toLocaleString("en-US")} 只宝可梦`;
            },
            CapturePokemonTypesQuest: function () {
                const type = PokemonType[this.type];
                const typeDisplayName = that.core.modules.Item.translationAPI.PokemonType(type);
                return `捕捉或孵化 ${this.amount.toLocaleString("en-US")} 只 ${typeDisplayName}属性宝可梦`;
            },
            ClearBattleFrontierQuest: function () {
                return `通过 ${this.amount.toLocaleString("en-US")} 层战斗开拓区`;
            },
            GainFarmPointsQuest: function () {
                return `获得 ${this.amount.toLocaleString("en-US")} 个农场代币`;
            },
            GainMoneyQuest: function () {
                return `获得 ${this.amount.toLocaleString("en-US")} 个宝可币`;
            },
            GainTokensQuest: function () {
                return `获得 ${this.amount.toLocaleString("en-US")} 个地牢代币`;
            },
            GainGemsQuest: function () {
                const type = PokemonType[this.type];
                const typeDisplayName = that.core.modules.Item.translationAPI.PokemonType(type);
                const gemDisplayName = typeDisplayName + (typeDisplayName.length == 1 ? "之" : "") + "宝石";
                return `获得 ${this.amount.toLocaleString("en-US")} 个${gemDisplayName}`;
            },
            HatchEggsQuest: function () {
                return `孵化 ${this.amount.toLocaleString("en-US")} 个蛋`;
            },
            MineLayersQuest: function () {
                return `在地下矿场采集每层所有宝物 ${this.amount.toLocaleString("en-US")} 次`;
            },
            MineItemsQuest: function () {
                return `在地下矿场采集 ${this.amount.toLocaleString("en-US")} 个宝物`;
            },
            CatchShiniesQuest: function () {
                return `捕捉或孵化 ${this.amount.toLocaleString("en-US")} 只闪光宝可梦`;
            },
            CatchShadowsQuest: function () {
                return `捕捉 ${this.amount.toLocaleString("en-US")} 只暗影宝可梦`;
            },
            DefeatGymQuest: function () {
                // 原文逻辑太复杂了 如果Gym模块未启用直接返回原文
                if (that.core.modules.Gym.disabled) {
                    return this.customDescription ?? this.defaultDescription;
                } else {
                    const gym = GymList[this.gymTown];
                    const town = gym.parent;
                    const { region, subRegion } = GymList[this.gymTown].parent;
                    const rawSubRegionName = SubRegions.getSubRegionById(region, subRegion).name;
                    const townDisplayName = town.displayName ?? town.name;
                    const subRegionDisplayName = that.core.modules.Regions.translationAPI.RegionAll(rawSubRegionName);
                    const gymDisplayName = gym.displayName;
                    return `击败 ${subRegionDisplayName}${townDisplayName} ${gymDisplayName} ${this.amount.toLocaleString("en-US")} 次`;
                }
            },
            DefeatDungeonQuest: function () {
                const dungeon = TownList[this.dungeon];
                const rawSubRegionName = SubRegions.getSubRegionById(this.region, dungeon.subRegion).name;
                const dungeonDisplayName = dungeon.displayName ?? this.dungeon;
                const subRegionDisplayName = that.core.modules.Regions.translationAPI.RegionAll(rawSubRegionName);
                return `清理 ${subRegionDisplayName}地牢 ${dungeonDisplayName} ${this.amount.toLocaleString("en-US")} 次`;
            },
            UsePokeballQuest: function () {
                return `使用 ${ItemList[GameConstants.Pokeball[this.pokeball]].displayName} ${this.amount.toLocaleString("en-US")}次`;
            },
            UseOakItemQuest: function () {
                const oakItem = App.game.oakItems.itemList[this.item].displayName;
                const amount = this.amount.toLocaleString("en-US");

                // 1. 将不同的道具行为抽离成映射表
                const oakItemMap = {
                    [OakItemType.Magic_Ball]: `捕捉 ${amount} 个野生宝可梦`,
                    [OakItemType.Amulet_Coin]: `获得 ${amount} 次宝可币`,
                    [OakItemType.Exp_Share]: `击败 ${amount} 个宝可梦`,
                };

                // 2. 获取对应的文本，如果没有匹配到则走兜底逻辑
                const actionText = oakItemMap[this.item] || `触发 ${amount} 次`;

                // 3. 直接通过模板字符串返回，省去数组操作
                return `装备 ${oakItem} 并 ${actionText}`;
            },
            HarvestBerriesQuest: function () {
                return `在农场收获 ${this.amount.toLocaleString("en-US")} 个 ${BerryType[this.berryType]} 树果`;
            },
        };

        Object.entries(questLists).forEach(([quest, getter]) => {
            const prototype = QuestHelper.quests[quest].prototype;
            Object.defineProperties(prototype, {
                hook_QuestModule_description: {
                    get() {
                        return (
                            // TODO 可能不必要
                            this.customDescription ||
                            (that.core.TranslationHelper.exporting || that.core.TranslationHelper.toggleRaw
                                ? this.defaultDescription
                                : this.displayDescription)
                        );
                    },
                    configurable: true,
                },
                displayDescription: {
                    get: getter,
                },
            });
        });
    }
}

const Core = new TranslationCore();

const MODULES_LIST = [
    PokemonModule,
    ItemModule,
    RegionsModule,
    RouteModule,
    TownModule,
    NPCModule,
    GymModule,
    TemporaryBattleModule,
    QuestLineModule,
    AchievementModule,
    QuestModule,
    UIModule,
];

MODULES_LIST.forEach((ModuleClass) => Core.registerModule(new ModuleClass()));
Core.start();
window.TranslationCore = Core;
