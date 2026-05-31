const t = Object.fromEntries(Object.entries(TranslationCore.TranslationCache).map(([a, b]) => [a, JSON.parse(b)]));

const QuestLine_NPCName = [];
const QuestLine_Pokemon = [];
const QuestLine_Gym = [];
const QuestLine_Item = [];
const QuestLine_Regions = [];
const QuestLine_Route = [];
const QuestLine_Town = [];
const QuestLine_TemporatyBattle = [];

Object.entries(Object.assign(...Object.values(t.QuestLine).map((i) => ({ ...i.description, ...i.descriptions })))).forEach(
    ([rawEN, rawCN]) => {
        Object.entries(t.NPC.NPCName).forEach(([en, cn]) => {
            if (rawEN.includes(en) && !rawCN.includes(cn)) {
                QuestLine_NPCName.push([en, cn, rawEN, rawCN]);
            }
        });
        Object.entries(t.Pokemon).forEach(([en, cn]) => {
            if (rawEN.includes(en) && !rawCN.includes(cn)) {
                QuestLine_Pokemon.push([en, cn, rawEN, rawCN]);
            }
        });
        Object.entries({ ...t.Gym.GymLeaderName, ...t.Gym.GymBadge }).forEach(([en, cn]) => {
            if (rawEN.includes(en) && !rawCN.includes(cn)) {
                QuestLine_Gym.push([en, cn, rawEN, rawCN]);
            }
        });
        Object.entries({ ...t.Item.ItemName, ...t.ItemKeyItem }).forEach(([en, cn]) => {
            if (rawEN.includes(en) && !rawCN.includes(cn)) {
                QuestLine_Item.push([en, cn, rawEN, rawCN]);
            }
        });

        Object.entries({ ...t.Regions.Region, ...t.Regions.SubRegion }).forEach(([en, cn]) => {
            if (rawEN.includes(en) && !rawCN.includes(cn)) {
                QuestLine_Regions.push([en, cn, rawEN, rawCN]);
            }
        });
        Object.entries(t.Route).forEach(([en, cn]) => {
            if (rawEN.includes(en) && !rawCN.includes(cn)) {
                QuestLine_Route.push([en, cn, rawEN, rawCN]);
            }
        });
        Object.entries(t.Town).forEach(([en, cn]) => {
            if (rawEN.includes(en) && !rawCN.includes(cn)) {
                QuestLine_Town.push([en, cn, rawEN, rawCN]);
            }
        });
        Object.entries({ ...t.TemporaryBattle.TemporaryBattleName, ...t.TemporaryBattle.TemporaryBattleDefeatMessage }).forEach(
            ([en, cn]) => {
                if (rawEN.includes(en) && !rawCN.includes(cn)) {
                    QuestLine_TemporatyBattle.push([en, cn, rawEN, rawCN]);
                }
            }
        );
    }
);
