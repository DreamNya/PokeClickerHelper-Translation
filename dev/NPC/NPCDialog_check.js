const t = Object.fromEntries(Object.entries(TranslationCore.TranslationCache).map(([a, b]) => [a, JSON.parse(b)]));

const NPCDialog_NPCName = [];
const NPCDialog_Pokemon = [];
const NPCDialog_Gym = [];
const NPCDialog_Item = [];
const NPCDialog_Regions = [];
const NPCDialog_Route = [];
const NPCDialog_Town = [];

Object.entries(t.NPC.NPCDialog).forEach(([rawEN, rawCN]) => {
    Object.entries(t.NPC.NPCName).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            NPCDialog_NPCName.push([en, cn, rawEN, rawCN]);
        }
    });
    Object.entries(t.Pokemon).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            NPCDialog_Pokemon.push([en, cn, rawEN, rawCN]);
        }
    });
    Object.entries(t.Gym).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            NPCDialog_Gym.push([en, cn, rawEN, rawCN]);
        }
    });
    Object.entries({ ...t.Item.ItemName, ...t.ItemKeyItem }).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            NPCDialog_Item.push([en, cn, rawEN, rawCN]);
        }
    });

    Object.entries({ ...t.Regions.Region, ...t.Regions.SubRegion }).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            NPCDialog_Regions.push([en, cn, rawEN, rawCN]);
        }
    });
    Object.entries(t.Route).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            NPCDialog_Route.push([en, cn, rawEN, rawCN]);
        }
    });
    Object.entries(t.Town).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            NPCDialog_Town.push([en, cn, rawEN, rawCN]);
        }
    });
});
