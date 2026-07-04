const { DataTypes } = require('sequelize')
// 引入数据库连接实例
const sequelize = require('@/config/database')

const UserList = sequelize.define(
  'UserList',
  {
    id: {
      type: DataTypes.INTEGER, // 数据类型
      primaryKey: true, // 是否为主键
      autoIncrement: true, // 是否自增
      allowNull: false, // 是否允许为空
      comment: '主键 id', // 字段注释
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: '', // 默认值为空字符串
      comment: '姓名',
    },
    mobile: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: '',
      comment: '手机号',
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '',
      comment: '密码',
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: '',
      comment: '邮箱',
    },
    // 创建时间 (映射为 createTime，使用 BIGINT 时间戳)
    createTime: {
      type: DataTypes.BIGINT,
      allowNull: false,
      comment: '创建时间',
    },
    // 更新时间 (映射为 updateTime，使用 BIGINT 时间戳)
    updateTime: {
      type: DataTypes.BIGINT,
      allowNull: false,
      comment: '更新时间',
    },
  },
  {
    // 核心配置项
    tableName: 'user_list', // 指定数据库中的真实表名
    timestamps: true, // 开启自动时间戳管理
    createdAt: 'createTime', // 将 createdAt 映射到 createTime 字段
    updatedAt: 'updateTime', // 将 updatedAt 映射到 updateTime 字段

    // 重要：因为时间戳被改为了 BIGINT，Sequelize 默认的 Date 转换会报错
    // 我们需要告诉 Sequelize 不要自动把 BIGINT 转成 Date 对象
    getterMethods: {
      createTime() {
        return this.getDataValue('createTime')
      },
      updateTime() {
        return this.getDataValue('updateTime')
      },
    },
  },
)

module.exports = UserList
