const t = Object.fromEntries(Object.entries(TranslationCore.TranslationCache).map(([a, b]) => [a, JSON.parse(b)]));

const TemporaryBattle_NPCName = [];
const TemporaryBattle_Pokemon = [];
const TemporaryBattle_Gym = [];
const TemporaryBattle_Item = [];
const TemporaryBattle_Regions = [];
const TemporaryBattle_Route = [];
const TemporaryBattle_Town = [];

Object.entries(t.TemporaryBattle.TemporaryBattleDefeatMessage).forEach(([rawEN, rawCN]) => {
    Object.entries(t.NPC.NPCName).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            TemporaryBattle_NPCName.push([en, cn, rawEN, rawCN]);
        }
    });
    Object.entries(t.Pokemon).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            TemporaryBattle_Pokemon.push([en, cn, rawEN, rawCN]);
        }
    });
    Object.entries(t.Gym).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            TemporaryBattle_Gym.push([en, cn, rawEN, rawCN]);
        }
    });
    Object.entries({ ...t.Item.ItemName, ...t.ItemKeyItem }).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            TemporaryBattle_Item.push([en, cn, rawEN, rawCN]);
        }
    });

    Object.entries({ ...t.Regions.Region, ...t.Regions.SubRegion }).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            TemporaryBattle_Regions.push([en, cn, rawEN, rawCN]);
        }
    });
    Object.entries(t.Route).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            TemporaryBattle_Route.push([en, cn, rawEN, rawCN]);
        }
    });
    Object.entries(t.Town).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            TemporaryBattle_Town.push([en, cn, rawEN, rawCN]);
        }
    });
});
