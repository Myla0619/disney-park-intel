# 对齐老师方案的工程记录

## 单一主线

Qwen2.5-32B-Instruct；LLaMA-Factory 全参 SFT；veRL 全参多轮 GRPO；共享工具服务、解析器和六维奖励。参数规模使用真实模型名称，不沿用录音中的模糊 34B 写法。模型、框架提交和协议固定在 `rl/train/framework-lock.json`。

## 本次实际修改

1. 实际构建 306 个去重任务家族，12 类，先固定 train/validation/test，保留来源标签。
2. 教师扩写默认五个变体，数字检查、语义等价检查、n-gram 去重、断点日志与最低保留数量检查；不把失败/去重前数量当作产量。
3. 教师轨迹蒸馏保留任务、约束、来源、split、快照、消息、工具结果和终止原因；复跑成功任务不重复，失败计数不再当作成功。
4. 全参 SFT 三阶段配置；权重通过显式样本曝光落实，固定验证家族，不把 weight 元数据留在文件里却忽略。
5. 全参 veRL AgentLoop 接入 TypeScript `/agent-step` 与 `/reward`；保留生成 token，工具观察 mask 为零。固定参考策略，移除 adapter 主入口。
6. 六维奖励答案权重始终至少 60%；最终行程重新校验，违规总分为零。
7. 进程内并发安全 Key 池，凭据失效禁用、限流冷却、重试和租约释放；不承诺跨进程共享同一 QPS 配额。
8. 独立 Judge 五维评分，非法分数报错；双模型匿名 A/B 交换评审，保留冲突标记。
9. 正式评测只使用冻结测试家族，固定快照，保存协议摘要和逐题输出，单独记录工具请求成功分母。
10. 面试稿重写为一份直接口述的文档；旧版本审计仅保留为工程归档，不进入口述稿。

## 必须区分的执行状态

- 已有 306 条任务种子。
- 教师扩写和蒸馏尚未实际启动：缺 DeepSeek 配置。没有生成假的扩写、假的 teacher rollout，也没有填写 1,800 条已完成轨迹。
- 全参八卡训练尚未实际启动：缺 GPU 连接。本地验证覆盖控制流和环境，不覆盖 GPU 显存、分布式训练与完整框架运行。
- veRL 接口按固定官方源码实现；Hydra 配置已与固定提交的官方默认配置合成通过；实际框架安装、token/logprob 边界与阶段恢复仍需 CUDA 主机验收。
- 全参新实验的指标尚未产生，历史 QLoRA/首步奖励数字不进入新的面试稿。

## 来源

- 老师原版： https://app.notion.com/p/Agentic-RL-3ce2cd85f9758087a09dc7a1bb0d08a9
- 迪士尼自然语言版： https://app.notion.com/p/pipeline-3cf2cd85f97581f2bac6d0c8af07e762
- veRL 接口： https://github.com/volcengine/verl/tree/23af6a7a2e8d6efeeb2adbe5d1689c7a24f503a3
- LLaMA-Factory： https://github.com/hiyouga/LLaMA-Factory/tree/dced5f8804bfbf7109ef7c14401db6bd5cce7e53

## 本地验证结果

- 31 项 Python 测试通过，包括完整多轮 HTTP 沙箱调用、观察 mask、截断零奖励、服务失败阻断、课程样本曝光和家族隔离。
- 五组 env/agent/data/reward/eval 冒烟通过。
- 新增数据与 Key 池测试通过；最终行程篡改、未知项目和缺失演出等回归通过。
- TypeScript RL 范围类型检查通过。
- Hydra 与固定 veRL 提交的 47 个官方配置文件组合验证通过，确认全参、GRPO、AgentLoop、KL 配置有效；不是 GPU 训练验收。
- 口述稿检查通过：27 个问题、8 组六段式回答，移除了历史奖励与旧百分比。

Git diff 检查因原始仓库元数据读取超时未完成，未据此宣称通过；本次没有提交、推送或合并，改动保留在独立工作树。

## GitHub 合并核对

已重新核对 Myla0619/disney-park-intel 的 main、add-sft-grpo-eval-results、claude/agetic-rl-projects-comparison-b4xerq，以及已合并 PR #10。主分支头为 95794ea865127b7fdf9d030fdaa9499881ff22ec，本地训练对齐分支已从该版本开始，包含已有 SFT/GRPO 与后续协议修复。

该远端版本的实际训练入口仍使用 4-bit + PeftModel，另有 veRL 模板，没有发现独立的已完成全参实现。新增全参入口与多轮 AgentLoop 是本地补充，不会把既有 SFT/GRPO 当作缺失代码重复覆盖。

面试口述稿同步在 docs/INTERVIEW_GUIDE.md，与面试工作区文档内容一致。
