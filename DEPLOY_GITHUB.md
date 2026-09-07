# 发布到 GitHub 与发 Release 指引

本文件只在本地用，照着敲命令即可。所有操作都从本目录执行：

```
C:/Users/Paul/WorkBuddy/2026-07-27-10-53-17/mmdvm-s3-terminal/server
```

## 第 1 步：生成 Personal Access Token（PAT）

GitHub 已禁用账号密码推送，必须用令牌。

1. 打开 https://github.com/settings/tokens
2. 点 **Generate new token** → 选 **Classic**（最省事）
3. Note 随便填，如 `qms-radio-push`
4. Expiration 选一个合适的（如 90 days）
5. 勾选范围：**☑ repo**（完整仓库读写即可）
6. 点 **Generate token**
7. **立刻复制**那串 `ghp_xxx` 令牌 —— 只显示这一次

> 备选：用 Fine-grained token，只给 `qms-radio-firmware` 仓库的 Contents 读写权限也行。

## 第 2 步：推送（首次需填一次令牌）

在 Git Bash / PowerShell 里进入本目录，执行：

```bash
cd C:/Users/Paul/WorkBuddy/2026-07-27-10-53-17/mmdvm-s3-terminal/server
git push -u origin main
```

- 弹窗/提示输入 **用户名**：填 `PaulLiszt`
- 提示输入 **密码**：**粘贴第 1 步的 PAT**（不是 GitHub 登录密码）
- Git Credential Manager 会自动缓存令牌，以后推送不再提示

推送成功后，仓库地址：https://github.com/PaulLiszt/qms-radio-firmware

### 若推送报错 `! [rejected] (fetch first / non-fast-forward)`

说明 GitHub 仓库里已有文件（比如你建仓时勾了 README）。先拉一次再推：

```bash
git pull origin main --allow-unrelated-histories
git push -u origin main
```

（若 GitHub 仓库完全是空的，不会出现这个错。）

## 第 3 步：发 Release（带固件二进制）

仓库里**不含**固件 `.bin`（已 `.gitignore` 排除），固件只走 Release 附件。

1. 把本地编译好的固件复制并改名：

```bash
copy ..\build\mmdvm_s3_terminal.bin qms-radio-firmware-v1.0.0.bin
```

2. 到仓库页 **Releases → Draft a new release**
   - Tag: `v1.0.0`
   - Title: `v1.0.0`
   - 描述：把本目录 `RELEASE.md` 内容粘进去
   - **Attach binaries**：拖入 `qms-radio-firmware-v1.0.0.bin`
   - 点 **Publish release**

完成。海外推广文案见仓库根目录 `promo_drafts.md`（仅本地，未入库）。
