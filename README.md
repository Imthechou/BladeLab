# BladeLab

手机优先的单局 3D 锻造原型。翻批看石、花信用点开料、控温、自由敲击刀身、三选一装配，最后鉴定并入藏。

直接点刀身落锤，键盘可以用空格敲击刀腹。等看到值得留下的纹样后，按「收锤」保住这把刀。鼠标或触摸可以在选料、装配和鉴定时拖动模型。

## 本地运行

需要 Node.js 22+。静态网页可直接部署，无需下载依赖。

```sh
npm start
npm test
```

打开 http://127.0.0.1:8217/。原型使用独立的浏览器本地记录，旧项目的藏刀和信用点数据无需迁移。

## 资产和参考

- 原石、刀胚、直刀、唐刀和爪子刀 GLB，以及 Three.js 加载器，来自 [锻刀大赛原项目](https://github.com/Imthechou/blade-forge-3d/tree/c0f64354debed6e7eb7aed6f6877f270ba5174af/game)。刀面材质、铁砧、锤子、矿石缩略图和合成锤击音为本原型制作。
- [ForgeTax](https://store.steampowered.com/app/5245810/ForgeTax/) 提供收锤与继续冒险的参考。
- [Valve 武器工艺指南](https://www.counter-strike.net/workshop/workshopfinishes/) 提供金属、纹样与表面处理分层的参考。
