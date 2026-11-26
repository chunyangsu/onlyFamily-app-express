const { DataTypes } = require('sequelize')
const sequelize = require('@/config/database')

const familyInvitation = sequelize.define(
  'familyInvitation',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      comment: '主键 id'
    },
    familyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { isInt: true, min: 1 },
      comment: '被邀请加入的家庭id'
    },
    inviterId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { isInt: true, min: 1 },
      comment: '邀请人用户id'
    },
    codeHash: {
      type: DataTypes.CHAR(64),
      allowNull: false,
      validate: { is: /^[a-f0-9]{64}$/ },
      comment: '随机邀请凭证的SHA-256哈希，不存储原始凭证'
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'unused',
      comment: '邀请状态：未使用unused、已使用used、已过期expired、已撤销revoked'
    },
    expiresTime: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      comment: '过期时间，毫秒时间戳'
    },
    joinerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '加入的用户id，未使用时为0'
    },
    joinTime: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      comment: '成功加入时间，毫秒时间戳，未使用时0'
    },
    createTime: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      comment: '创建时间，毫秒时间戳'
    },
    updateTime: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      comment: '更新时间，毫秒时间戳'
    }
  },
  {
    // 核心配置项
    tableName: 'family_invitation',
    engine: 'InnoDB', // 接受邀请时需要事务和行锁
    timestamps: false,
    createdAt: 'createTime', // 将 createdAt 映射到 createTime 字段
    updatedAt: 'updateTime', // 将 updatedAt 映射到 updateTime 字段
    indexes: [
      { name: 'uk_family_invitation_code_hash', unique: true, fields: ['codeHash'] },
      { name: 'idx_family_invitation_family_inviter_status', fields: ['familyId', 'inviterId', 'status'] }
    ],
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

module.exports = familyInvitation
