# 模型备份

2026-09-08 将旧实验的 SFT 和 GRPO adapter 备份到本仓库 Release：

[下载备份](https://github.com/Myla0619/disney-park-intel/releases/tag/model-backup-2026-09-08)

附件包括 sft-adapter.tar.gz、grpo-adapter.tar.gz（含 ref 参考权重）、base-config.tar.gz、SHA256SUMS 和 BACKUP.md。adapter 压缩包保留分词器、模板和原始实验配置。

恢复前用 `shasum -a 256 -c SHA256SUMS` 校验三个压缩包。解压后需要另行准备 Qwen/Qwen2.5-32B-Instruct 基座，并将 adapter 配置中的旧本地路径映射到新环境。基座的原始下载 revision 未确认，加载时需核对配置与兼容性。

本备份未包含 62GB 基座权重、中间 checkpoint、优化器状态或全部训练数据。服务器原文件保留。文件校验通过不代表已通过推理或质量评测；旧实验的协议问题见 data/rl/eval/README.md。
