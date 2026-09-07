/**
 * 我的家庭厨房 Agent — 类型定义（JSDoc，供编辑器提示；无需构建）
 * 在 engine.js / data.js 顶部可用：/// <reference path="./types.js" />
 *
 * @typedef {'main' | 'sub' | 'garnish'} IngredientRole
 *
 * @typedef {Object} Ingredient
 * @property {string} n  食材标准名
 * @property {number} q  基准份量（2 人份）
 * @property {string} u  单位（g / ml / 个 / 根 / …）
 * @property {IngredientRole} r  角色
 *
 * @typedef {Object} Recipe
 * @property {string} id
 * @property {string} name
 * @property {string} cat  品类：炒菜/炖菜/汤/蒸菜/蒸煮/炸炒/凉菜/主食
 * @property {number} time 单道烹饪时间（分钟）
 * @property {string[]} tags  忌口标签：猪肉/牛羊肉/鸡肉/海鲜/蛋/奶/花生/辣/香菜/葱蒜/豆制品/主食/素
 * @property {string} flavor
 * @property {string} desc
 * @property {Ingredient[]} ing
 * @property {string[]} season  必需调料
 * @property {string[]} [seasonOpt] 可选调料
 * @property {string[]} prep
 * @property {string[]} steps
 * @property {string} [tip]
 * @property {string} [extraNote]
 *
 * @typedef {Object} Taboo
 * @property {string} id
 * @property {string} label
 * @property {string[]} [tags]  命中任一即排除该菜
 * @property {string[]} [omit]  可省略的点缀食材名
 * @property {boolean} [softAllium]  葱蒜软过滤（点缀可省，主料才排除）
 * @property {boolean} [vegetarianMode]  仅保留带「素」标签的菜
 *
 * @typedef {Object} TabooFilter
 * @property {Set<string>} blockTags
 * @property {Set<string>} omitNames
 * @property {boolean} softAllium
 * @property {boolean} vegetarianMode
 *
 * @typedef {Object} RecommendMenuInput
 * @property {string|string[]} [ingredients]  现有食材（文本或已解析数组）
 * @property {string[]} [seasonings]  已有调料
 * @property {string[]} [taboos]  忌口 id 列表
 * @property {number} [people]  用餐人数 1–12
 * @property {number} [time]  最高可用时间（分钟）
 * @property {number} [dishCount]  期望菜数（覆盖人数推算）
 * @property {boolean} [preferCombo]  优先「一汤 + 主菜 + 凉菜」组合，默认 true
 *
 * @typedef {Object} MenuPortion
 * @property {string} name
 * @property {string} amount
 * @property {IngredientRole} role
 * @property {boolean} owned
 *
 * @typedef {Object} MenuItem
 * @property {Recipe} recipe
 * @property {number} score
 * @property {number} coverage
 * @property {Ingredient[]} ing
 * @property {Ingredient[]} missIng
 * @property {string[]} missSeason
 * @property {string[]} matched
 * @property {MenuPortion[]} portions
 * @property {{name:string, owned:boolean}[]} seasonList
 * @property {string[]} seasonOptList
 *
 * @typedef {Object} RecommendMenuResult
 * @property {MenuItem[]} menu
 * @property {number} total  预估总时长（分钟）
 * @property {number} people
 * @property {string[]} unused  未用到的现有食材
 * @property {string[]} have
 * @property {{name:string, dishes:string[]}[]} buyIng
 * @property {{name:string, dishes:string[]}[]} buySeason
 * @property {string[]} notes
 * @property {string[]} omitted
 *
 * @typedef {Object} TimelineRow
 * @property {number} at
 * @property {string} tag
 * @property {string} dish
 * @property {string} text
 * @property {'prep'|'cook'|'done'} kind
 */
