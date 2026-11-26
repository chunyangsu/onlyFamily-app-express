# 家庭成员角色迁移

`family_user_map.role` 从数字角色改为字符串角色：`1 → admin`、`2 → member`。
模型使用 `VARCHAR(50) NOT NULL DEFAULT 'member'`。

## 已有数据库

以下 SQL 需要在确认目标数据库并备份后手动执行，本次代码修改未执行数据库迁移。
迁移期间停止应用及其他写入方；开发环境也应先完成迁移，再启动应用，避免自动同步表结构与迁移并发执行。
MySQL 的 `ALTER TABLE` 会隐式提交，不能依赖事务整体回滚，失败后应检查表结构和数据再继续。

1. 检查现有角色及数量。如有以下四种值以外的数据，先人工确认，不要继续迁移。

```sql
SELECT role, COUNT(*) AS total
FROM family_user_map
GROUP BY role;

SELECT id, role
FROM family_user_map
WHERE role IS NULL
   OR CAST(role AS CHAR) NOT IN ('1', '2', 'admin', 'member');
```

2. 先将字段转为字符串，再转换历史数据。已转换的角色保持不变。

```sql
ALTER TABLE family_user_map
  MODIFY COLUMN role VARCHAR(50) NOT NULL DEFAULT 'member'
  COMMENT '角色：管理员admin、普通成员member';

UPDATE family_user_map
SET role = CASE role
  WHEN '1' THEN 'admin'
  WHEN '2' THEN 'member'
  ELSE role
END
WHERE role IN ('1', '2');
```

3. 再次查询角色数量，确认仅有 `admin` / `member`，且数量分别与迁移前一致，再启动新版应用。

```sql
SELECT role, COUNT(*) AS total
FROM family_user_map
GROUP BY role;
```

仅修改模型或执行 `sync({ alter: true })` 不会将历史数据的 `1` / `2` 转换为角色名称。
如需回退旧版应用，应在停止写入后配套回退字段类型和角色数据，或恢复迁移前备份，不能仅回退代码。
