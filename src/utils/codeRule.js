/**
 * 生成食物订单编号
 * @param {*} id 新增的食物订单id
 * @returns
 */
const generateFoodOrderCode = (id) => {
  let tempCode = ''
  if (id > 0) {
    let codeNumber = id.toString().padStart(8, '0')
    tempCode = `FO${codeNumber}`
  }
  return tempCode
}

module.exports = { generateFoodOrderCode }
