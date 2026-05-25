const t = Object.fromEntries(Object.entries(TranslationCore.TranslationCache).map(([a, b]) => [a, JSON.parse(b)]));

const Achievement_NPCName = [];
const Achievement_Pokemon = [];
const Achievement_Gym = [];
const Achievement_Item = [];
const Achievement_Regions = [];
const Achievement_Route = [];
const Achievement_Town = [];
const Achievement_TemporatyBattle = [];

Object.entries({ ...t.Achievement.name, ...t.Achievement.description }).forEach(([rawEN, rawCN]) => {
    Object.entries(t.NPC.NPCName).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            Achievement_NPCName.push([en, cn, rawEN, rawCN]);
        }
    });
    Object.entries(t.Pokemon).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            Achievement_Pokemon.push([en, cn, rawEN, rawCN]);
        }
    });
    Object.entries(t.Gym).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            Achievement_Gym.push([en, cn, rawEN, rawCN]);
        }
    });
    Object.entries({ ...t.Item.ItemName, ...t.ItemKeyItem }).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            Achievement_Item.push([en, cn, rawEN, rawCN]);
        }
    });

    Object.entries({ ...t.Regions.Region, ...t.Regions.SubRegion }).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            Achievement_Regions.push([en, cn, rawEN, rawCN]);
        }
    });
    Object.entries(t.Route).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            Achievement_Route.push([en, cn, rawEN, rawCN]);
        }
    });
    Object.entries(t.Town).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            Achievement_Town.push([en, cn, rawEN, rawCN]);
        }
    });
    Object.entries({ ...t.TemporaryBattle.TemporaryBattleName, ...t.TemporaryBattle.TemporaryBattleDefeatMessage }).forEach(
        ([en, cn]) => {
            if (rawEN.includes(en) && !rawCN.includes(cn)) {
                Achievement_TemporatyBattle.push([en, cn, rawEN, rawCN]);
            }
        }
    );
});
