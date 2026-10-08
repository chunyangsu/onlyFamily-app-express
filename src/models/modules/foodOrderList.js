const { DataTypes } = require('sequelize')
// 引入数据库连接实例
const sequelize = require('@/config/database')

const foodOrderList = sequelize.define(
  'foodOrderList',
  {
    id: {
      type: DataTypes.INTEGER, // 数据类型
      primaryKey: true, // 是否为主键
      autoIncrement: true, // 是否自增
      allowNull: false, // 是否允许为空
      comment: '主键 id' // 字段注释
    },
    code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: '',
      comment: '订单编号'
    },
    remark: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '', // 默认值为空字符串
      comment: '订单备注'
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'normal',
      comment: '订单状态：正常 normal、取消 cancelled、删除 deleted'
    },
    progress: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'pending',
      comment: '订单进度：待确认 pending、制作中 cooking、未完成 incomplete、已完成 completed'
    },
    createId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '创建人id'
    },
    // 创建时间 (映射为 createTime，使用 BIGINT 时间戳)
    createTime: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      comment: '创建时间'
    },
    updateId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '更新人id'
    },
    // 更新时间 (映射为 updateTime，使用 BIGINT 时间戳)
    updateTime: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      comment: '更新时间'
    }
  },
  {
    // 核心配置项
    tableName: 'food_order_list', // 指定数据库中的真实表名
    timestamps: true, // 开启自动时间戳管理
    createdAt: 'createTime', // 将 createdAt 映射到 createTime 字段
    updatedAt: 'updateTime', // 将 updatedAt 映射到 updateTime 字段
    // 生命周期钩子，自动处理 BIGINT 时间戳
    hooks: {
      // 在创建数据之前，自动填入当前时间戳
      beforeCreate: (instance) => {
        const now = Date.now()
        instance.createTime = now
      },
      // 在更新数据之前，自动更新 updateTime
      beforeUpdate: (instance) => {
        instance.updateTime = Date.now()
      }
    },
    // 重要：因为时间戳被改为了 BIGINT，Sequelize 默认的 Date 转换会报错
    // 防止 Sequelize 自动将 BIGINT 转换为 Date 对象
    getterMethods: {
      createTime() {
        return this.getDataValue('createTime')
      },
      updateTime() {
        return this.getDataValue('updateTime')
      }
    }
  }
)

module.exports = foodOrderList
