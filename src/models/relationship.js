const { foodOrderList, foodOrderDetails, userList } = require('@/models')

/**
 * 定义食物订单与菜品明细之间的关系
 */

// 一个食物订单有多个菜品明细
foodOrderList.hasMany(foodOrderDetails, {
  foreignKey: 'foodOrderId', // 表示外键存在于food_order_details.foodOrderId
  sourceKey: 'id',
  as: 'dishArr'
})

// 一个菜品明细属于一个食物订单
foodOrderDetails.belongsTo(foodOrderList, {
  foreignKey: 'foodOrderId',
  targetKey: 'id',
  as: 'orderId' // as：关联别名
})

// 用户->食物订单
userList.hasMany(foodOrderList, {
  foreignKey: 'createId',
  sourceKey: 'id',
  as: 'foodOrderArr'
})
// 食物订单 -> 用户
foodOrderList.belongsTo(userList, {
  foreignKey: 'createId',
  targetKey: 'id',
  as: 'creator'
})

module.exports = {
  foodOrderList,
  foodOrderDetails,
  userList
}
