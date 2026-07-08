export function Resume() {
  return (
    <>
      {/* ===== HEADER ===== */}
      <div className="header">
        <div className="header-inner">
          <div className="header-left">
            <div className="header-name">马倩倩</div>
            <div className="header-meta">女 · 前端开发 / AI 前端（Agent 方向）</div>
            <div className="header-tags">
              <span className="header-tag">Agent 开发</span>
              <span className="header-tag">AI 研发提效</span>
              <span className="header-tag">期望城市：北京</span>
            </div>
          </div>
          <div className="header-right">
            <div><a href="tel:15810893608">15810893608</a></div>
            <div><a href="mailto:maqianqian1014@163.com">maqianqian1014@163.com</a></div>
          </div>
        </div>
      </div>

      {/* ===== MAIN ===== */}
      <div className="container">

        {/* SIDEBAR */}
        <div className="sidebar">

          <div className="section">
            <div className="section-title">个人简介</div>
            <ul className="intro-list">
              <li>7 年前端经验，以 C 端研发为主，覆盖支付宝/微信小程序、H5 等多端场景，擅长解决一码多端问题并从业务痛点出发设计技术方案落地</li>
              <li>具备全链路 owner 和项目 PM 视角，关注端到端交付质量</li>
              <li>在稳定性建设、体验优化、AI 工程化方向均有实际成果</li>
              <li>做事严谨，乐于分享与沉淀</li>
            </ul>
          </div>

          <div className="section">
            <div className="section-title">掌握技能</div>
            <div className="skill-tags">
              <span className="skill-tag">Vue / React</span>
              <span className="skill-tag">体验性能优化</span>
              <span className="skill-tag">稳定性监控与治理</span>
              <span className="skill-tag">小程序</span>
              <span className="skill-tag">一码多端</span>
              <span className="skill-tag">AI Harness 研发范式</span>
            </div>
          </div>

          <div className="section">
            <div className="section-title">教育经历</div>
            <div className="edu-block">
              <div className="edu-school">中央财经大学</div>
              <div className="edu-major">信息学院 · 电子商务 · 本科 · 全日制</div>
              <div className="edu-time">2015.09 — 2019.07</div>
            </div>
          </div>

          <div className="section">
            <div className="section-title">个人优势</div>
            <ul className="intro-list">
              <li>做事严谨，复杂需求先产出流程图与技术方案，提前演练难点并做好各方预期管理</li>
              <li>注重夯实基础，乐于分享研发经验与业务问题解决方案</li>
              <li>从业务研发到主动承担项目 PM，关注交付质量与上下游链路的端到端保障</li>
            </ul>
          </div>

        </div>

        {/* MAIN CONTENT */}
        <div className="main">

          <div className="section">
            <div className="section-title">工作经历</div>

            {/* 飞猪 */}
            <div className="exp-item">
              <div className="exp-header">
                <span className="exp-company">阿里巴巴 · 飞猪综合交通</span>
                <span className="exp-date">2023.08 — 至今</span>
              </div>
              <div className="exp-role">高级前端工程师 / 业务线 Owner</div>

              <div className="dim-block">
                <div className="dim-title">业务需求</div>
                <div className="dim-row">
                  <span className="dim-label">角色</span>
                  <span className="dim-text">接送机 / 汽车票全链路页面 <strong>owner</strong>，生单改造项目 <strong>PM</strong></span>
                </div>
                <div className="dim-row">
                  <span className="dim-label">动作</span>
                  <span className="dim-text">主导接送列表生单流程简化与改单全流程独立交付；持续维护淘宝 / 支付宝 / 微信 / 高德四端功能完整性与多端兼容；推进接送首页核心功能组件抽象复用</span>
                </div>
                <div className="dim-row">
                  <span className="dim-label">结果</span>
                  <span className="dim-text">搜索-支付转化率 <strong>+1.9pt</strong>；四端功能零缺漏，组件复用降低跨需求重复建设成本</span>
                </div>
              </div>

              <div className="dim-block">
                <div className="dim-title">稳定性</div>
                <div className="dim-row">
                  <span className="dim-label">角色</span>
                  <span className="dim-text">综合交通前端稳定性监控体系 <strong>负责人</strong></span>
                </div>
                <div className="dim-row">
                  <span className="dim-label">动作</span>
                  <span className="dim-text">从零搭建 JS Error 告警体系，治理误告警；开发 JS 错误一键定位工具；共建自动化巡检拦截上线白屏；推进接送主链路秒开率优化</span>
                </div>
                <div className="dim-row">
                  <span className="dim-label">结果</span>
                  <span className="dim-text">有效告警率 <strong>95%</strong>，累计排查线上问题 <strong>30+</strong>；列表页秒开率 <strong>13% → 80%</strong>，全程 <strong>0 P 级故障</strong></span>
                </div>
              </div>

              <div className="dim-block">
                <div className="dim-title">体验优化</div>
                <div className="dim-row">
                  <span className="dim-label">角色</span>
                  <span className="dim-text">接送链路体验专项 <strong>发起人与执行者</strong></span>
                </div>
                <div className="dim-row">
                  <span className="dim-label">动作</span>
                  <span className="dim-text">主动调研竞对交互，提出优化方案并反向推产品立项；主导订详页改版与地图组件架构重构（AI 辅助重构 / 滑动交互优化）；持续沉淀多场景体验优化专项</span>
                </div>
                <div className="dim-row">
                  <span className="dim-label">结果</span>
                  <span className="dim-text">AB 灰度验证后全量上线；多核心场景体验持续迭代提升</span>
                </div>
              </div>

              <div className="dim-block">
                <div className="dim-title">AI 探索</div>
                <div className="dim-row">
                  <span className="dim-label">角色</span>
                  <span className="dim-text">团队 AI 工程化方向 <strong>探索者与推动者</strong></span>
                </div>
                <div className="dim-row">
                  <span className="dim-label">动作</span>
                  <span className="dim-text">独立开发多端埋点 Skill 解决埋点痛点，完成团队分享推广；探索 Harness 研发范式（opespec / harness-creator + 跨会话 + TDD）；推进综合交通 kbase 知识库建设；落地 AI 助手流式调用</span>
                </div>
                <div className="dim-row">
                  <span className="dim-label">结果</span>
                  <span className="dim-text">埋点 Skill 团队内 <strong>30+</strong> 下载；分享内容被团队成员积极接入、复用</span>
                </div>
              </div>
            </div>

            {/* 携程 */}
            <div className="exp-item">
              <div className="exp-header">
                <span className="exp-company">携程旅行网 · Rezen 酒店业务</span>
                <span className="exp-date">2021.09 — 2023.08</span>
              </div>
              <div className="exp-role">前端开发工程师</div>

              <div className="simple-block">
                <div className="simple-title">中后台</div>
                <div className="simple-text">丽呈集团 Rezen 系列前端：员工营销系统（Rezen One Wx，企微内嵌、扫码营销）、集团运营系统（Rezen Business）、宾客管理桌面应用（PC-Guest，Vue3 + Vite + TS）。微前端架构下沉淀跨子应用共用业务组件、eventBus 通信，主导业务权限控制设计与落地。</div>
              </div>
              <div className="simple-block">
                <div className="simple-title">小程序</div>
                <div className="simple-text">C 端酒店预订小程序：用 uniapp 完成原生小程序框架升级、一套代码编译 H5 与小程序双端；封装 10+ 公用组件，引入 vue-i18n 国际化并写脚本将文案提取 / 词条生成 / 变量替换自动化，AES 加解密保护敏感信息。</div>
              </div>
            </div>

            {/* 天职 */}
            <div className="exp-item">
              <div className="exp-header">
                <span className="exp-company">天职国际会计师事务所</span>
                <span className="exp-date">2019.07 — 2021.08</span>
              </div>
              <div className="exp-role">前端开发工程师</div>
              <div className="simple-block">
                <div className="simple-text">企业内部系统前端开发，夯实 HTML / CSS / JavaScript 与 Vue 工程化基础，前端职业生涯起步阶段。</div>
              </div>
            </div>

          </div>

          <div className="section">
            <div className="section-title">项目经历</div>

            <div className="exp-item">
              <div className="exp-header">
                <span className="exp-company">AI 智能面试教练（Personal Interview Agent）</span>
                <span className="exp-date">2025.06 — 至今</span>
              </div>
              <div className="exp-role">独立开发 | React + TypeScript + Node.js + RAG + MCP</div>

              <div className="dim-block">
                <div className="dim-row">
                  <span className="dim-label">RAG</span>
                  <span className="dim-text">基于 RAG 架构构建面试回答助手：将个人经历 Markdown 知识库通过 text-embedding-v3 生成向量索引，面试提问时通过余弦相似度语义检索 Top3 相关文档注入 LLM 上下文，以第一人称生成结构化回答</span>
                </div>
                <div className="dim-row">
                  <span className="dim-label">MCP</span>
                  <span className="dim-text">实现 ReAct 推理流程 + MCP 工具调用：手写 HTTP MCP Server 暴露 5 个标准化工具（简历检索、技术栈查询、项目经验、性能数据、稳定性成果），支持 stdio 桥接兼容 Cursor / Claude Code 等外部工具</span>
                </div>
                <div className="dim-row">
                  <span className="dim-label">记忆</span>
                  <span className="dim-text">设计对话记忆管理机制：采用滑动窗口保留近期对话 + LLM 生成摘要保留长期记忆，4000 token 预算分配策略；前端 SSE 流式输出配合打字机效果，实现思考过程（Thought→Tool→Result→Answer）可视化</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
