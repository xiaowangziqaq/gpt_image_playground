# 宝塔面板部署指南

本文档介绍如何在宝塔面板上部署 GPT Image Playground 应用。

## 前置要求

- 已安装宝塔面板
- 已安装 Node.js（建议 v18 或更高版本）
- 已安装 PM2 管理器（宝塔面板 -> 软件商店 -> PM2管理器）
- 已安装 Nginx

## 部署步骤

### 1. 上传代码到服务器

#### 方法一：使用 Git（推荐）

```bash
# 进入网站目录
cd /www/wwwroot

# 克隆代码
git clone https://github.com/xiaowangziqaq/gpt_image_playground.git

# 进入项目目录
cd gpt_image_playground
```

#### 方法二：上传压缩包

1. 在本地打包项目（排除 node_modules 和 data 目录）
2. 通过宝塔面板的文件管理器上传到 `/www/wwwroot/`
3. 解压文件

### 2. 安装依赖

```bash
cd /www/wwwroot/gpt_image_playground
npm install
```

### 3. 构建项目

```bash
npm run build
```

### 4. 创建数据目录

```bash
# 创建数据目录
mkdir -p data

# 设置权限
chmod 755 data
```

### 5. 使用 PM2 启动应用

```bash
# 启动所有服务
pm2 start ecosystem.config.json

# 查看服务状态
pm2 status

# 查看日志
pm2 logs
```

### 6. 配置 Nginx 反向代理

#### 6.1 在宝塔面板创建网站

1. 宝塔面板 -> 网站 -> 添加站点
2. 域名：填写您的域名（如：`image.yourdomain.com`）
3. 根目录：`/www/wwwroot/gpt_image_playground/dist`
4. PHP版本：纯静态
5. 创建数据库：不创建

#### 6.2 配置 Nginx 反向代理

在宝塔面板 -> 网站 -> 点击域名 -> 设置 -> 配置文件，添加以下内容：

```nginx
# 在 server 块内添加

# 认证服务器反向代理
location /api/auth/ {
    proxy_pass http://127.0.0.1:2166/api/auth/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}

# 管理员 API 反向代理
location /api/admin/ {
    proxy_pass http://127.0.0.1:2166/api/admin/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}

# 任务 API 反向代理
location /api/tasks/ {
    proxy_pass http://127.0.0.1:2166/api/tasks/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}

# 图片 API 反向代理
location /api/images/ {
    proxy_pass http://127.0.0.1:2166/api/images/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    client_max_body_size 50m;
}

# 前端静态文件（如果使用 Vite preview）
location / {
    proxy_pass http://127.0.0.1:5173;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}
```

**注意**：如果您直接使用 `dist` 目录作为网站根目录，则不需要最后一个 `location /` 配置块。

#### 6.3 完整的 Nginx 配置示例

```nginx
server {
    listen 80;
    server_name image.yourdomain.com;
    
    # 如果使用 dist 目录作为根目录
    root /www/wwwroot/gpt_image_playground/dist;
    index index.html;
    
    # 客户端上传大小限制
    client_max_body_size 50m;
    
    # 认证服务器反向代理
    location /api/auth/ {
        proxy_pass http://127.0.0.1:2166/api/auth/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # 管理员 API 反向代理
    location /api/admin/ {
        proxy_pass http://127.0.0.1:2166/api/admin/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # 任务 API 反向代理
    location /api/tasks/ {
        proxy_pass http://127.0.0.1:2166/api/tasks/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # 图片 API 反向代理
    location /api/images/ {
        proxy_pass http://127.0.0.1:2166/api/images/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50m;
    }
    
    # 前端路由（SPA）
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 7. 配置 SSL 证书（可选但推荐）

1. 宝塔面板 -> 网站 -> 点击域名 -> 设置 -> SSL
2. 选择 "Let's Encrypt" 免费证书
3. 点击 "申请"
4. 申请成功后，开启 "强制HTTPS"

### 8. 配置防火墙

确保以下端口已开放：
- 80（HTTP）
- 443（HTTPS）

内部端口（不需要对外开放）：
- 5173（Vite preview）
- 2166（认证服务器）

### 9. 验证部署

访问您的域名：`https://image.yourdomain.com`

默认管理员账号：
- 用户名：`admin`
- 密码：`admin123`

**重要**：首次登录后请立即修改管理员密码！

## 日常维护

### 查看日志

```bash
# 查看所有服务日志
pm2 logs

# 查看特定服务日志
pm2 logs gpt-image-auth-server
pm2 logs gpt-image-frontend
```

### 重启服务

```bash
# 重启所有服务
pm2 restart all

# 重启特定服务
pm2 restart gpt-image-auth-server
```

### 更新代码

```bash
cd /www/wwwroot/gpt_image_playground

# 拉取最新代码
git pull

# 安装依赖（如有更新）
npm install

# 重新构建
npm run build

# 重启服务
pm2 restart all
```

### 备份数据

```bash
# 备份数据库
cp data/auth.db data/auth.db.backup.$(date +%Y%m%d)

# 或使用宝塔面板的定时任务功能自动备份
```

## 性能优化建议

### 1. 使用 PM2 集群模式（可选）

如果服务器有多核 CPU，可以启用集群模式：

修改 `ecosystem.config.json`：

```json
{
  "apps": [
    {
      "name": "gpt-image-frontend",
      "script": "npx",
      "args": "vite preview --host 0.0.0.0 --port 5173",
      "instances": "max",
      "exec_mode": "cluster",
      ...
    }
  ]
}
```

### 2. 启用 Nginx 缓存

在 Nginx 配置中添加：

```nginx
# 在 http 块内
proxy_cache_path /tmp/nginx_cache levels=1:2 keys_zone=api_cache:10m max_size=100m inactive=60m;

# 在 location 块内
location /api/ {
    proxy_cache api_cache;
    proxy_cache_valid 200 5m;
    ...
}
```

### 3. 启用 Gzip 压缩

在 Nginx 配置中添加：

```nginx
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
gzip_min_length 256;
```

## 故障排查

### 1. 无法访问网站

- 检查 Nginx 是否运行：`systemctl status nginx`
- 检查 PM2 服务是否运行：`pm2 status`
- 检查防火墙端口是否开放

### 2. 登录失败

- 检查认证服务器是否运行：`pm2 logs gpt-image-auth-server`
- 检查数据库文件是否存在：`ls -la data/auth.db`
- 检查 Nginx 反向代理配置是否正确

### 3. 图片上传失败

- 检查 Nginx 配置中的 `client_max_body_size`
- 检查服务器磁盘空间：`df -h`
- 检查 data 目录权限：`ls -la data`

## 安全建议

1. **修改默认管理员密码**：首次登录后立即修改
2. **定期备份数据库**：设置自动备份任务
3. **启用 HTTPS**：使用 SSL 证书加密传输
4. **限制访问**：如果只供内部使用，可以设置 IP 白名单
5. **定期更新依赖**：`npm update` 更新依赖包
6. **监控日志**：定期检查异常登录和错误日志

## 联系支持

如有问题，请访问：https://github.com/xiaowangziqaq/gpt_image_playground/issues
