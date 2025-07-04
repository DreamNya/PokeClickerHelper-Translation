const { Project, SyntaxKind } = require("ts-morph");
const fs = require("fs");

const filePath = "json/Achievement.json";

const Translation = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath))
    : {
          name: {},
          nameReg: {},
          description: {},
          descriptionReg: {},
      };

const project = new Project();
const sourceFile = project.addSourceFileAtPath("./pokeclicker/src/scripts/achievements/AchievementHandler.ts");

// 查找函数调用
const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => {
    const expression = call.getExpression();
    const expressionName = expression.getText();
    return expressionName == "AchievementHandler.addAchievement" || expressionName == "AchievementHandler.addSecretAchievement";
});

function formatString(template) {
    switch (template.getKind()) {
        // 静态字符串
        case SyntaxKind.StringLiteral:
            return template.getLiteralValue();
        // 模板字符串
        case SyntaxKind.TemplateExpression:
            const head = template.getHead().getLiteralText(); // .replace(/\./g,'\\.');
            const text = template
                .getTemplateSpans()
                .reduce((text, span) => text + "(.*?)" + span.getLiteral().getLiteralText(), head);

            // 正则无法区分连续的捕获
            const formattedText = text.replace(/(\(\.\*\?\) )+/, "(.*?) ").replace(/(\(\.\*\?\))+/, "(.*?)");

            return `^${formattedText}$`;
        default:
            throw new Error(`Unsupported SyntaxKind: ${template.getKindName()}`);
    }
}

const results = calls.reduce(
    (obj, call) => {
        const expressionName = call.getExpression().getText();
        if (expressionName == "AchievementHandler.addAchievement") {
            const [nameTemplate, descriptionTemplate] = call.getArguments();

            const name = formatString(nameTemplate);
            if (name.startsWith("^")) {
                obj.nameReg.push([name, Translation.nameReg[name] || ""]);
            } else {
                obj.name[name] = Translation.name[name] || "";
            }

            const description = formatString(descriptionTemplate);
            if (description.startsWith("^")) {
                obj.descriptionReg.push([description, Translation.descriptionReg[description] || ""]);
            } else {
                obj.description[description] = Translation.description[description] || "";
            }
        } else if (expressionName == "AchievementHandler.addSecretAchievement") {
            const [nameTemplate, descriptionTemplate, , hintTemplate] = call.getArguments();

            const name = formatString(nameTemplate);
            obj.name[name] = Translation.name[name] || "";

            const description = formatString(descriptionTemplate);
            obj.description[description] = Translation.description[description] || "";

            const hint = formatString(hintTemplate);
            obj.hint[hint] = Translation.hint?.[hint] || "";
        }
        return obj;
    },
    { name: {}, nameReg: [], description: {}, descriptionReg: [], hint: {} }
);

// 更精准的正则优先匹配 简单量化为正则长度
results.nameReg = Object.fromEntries(results.nameReg.sort(([a], [b]) => b.length - a.length));
results.descriptionReg = Object.fromEntries(results.descriptionReg.sort(([a], [b]) => b.length - a.length));

fs.writeFileSync(filePath, JSON.stringify(results, null, 4));
