import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export default defineConfig(({ mode }) => {
  const isMobile = mode === 'mobile';
  
  return {
    // Tauri 打包后使用相对路径
    base: './',
    // 指定公共资源目录
    publicDir: 'public',
    server: {
      port: 1421,
      strictPort: true,
      cors: true,
      host: '127.0.0.1'
    },
    // Tauri 2.x 中使用正确的 API 模块
    optimizeDeps: {
      include: [
        '@tauri-apps/api',
        '@tauri-apps/api/app',
        '@tauri-apps/api/path',
        '@tauri-apps/api/window'
      ]
    },
    // 若使用 pnpm/workspace 在 SSR 或构建阶段出问题，可取消外部化
    ssr: {
      noExternal: ['@tauri-apps/api']
    },
    // 构建配置
    build: {
      // 移动端使用不同的入口
      rollupOptions: isMobile ? {
        input: {
          main: 'index-mobile.html'
        },
        output: {
          manualChunks: undefined,
        }
      } : {
        output: {
          manualChunks: undefined,
        }
      },
      // 不要过度压缩，保留必要的函数名
      minify: 'terser',
      terserOptions: {
        compress: {
          // 保留函数名称
          keep_fnames: true,
        },
        mangle: {
          // 保留函数名称
          keep_fnames: true,
        }
      },
      // 复制额外的静态资源
      copyPublicDir: true
    },
    plugins: [
      {
        name: 'copy-vendor',
        closeBundle() {
          // 复制 vendor 目录到 dist
          const vendorSrc = 'vendor';
          const vendorDest = 'dist/vendor';
          
          try {
            mkdirSync(vendorDest, { recursive: true });
            const files = readdirSync(vendorSrc);
            files.forEach(file => {
              const srcPath = join(vendorSrc, file);
              const destPath = join(vendorDest, file);
              if (statSync(srcPath).isFile()) {
                copyFileSync(srcPath, destPath);
              }
            });
            console.log('✓ Copied vendor directory to dist');
          } catch (err) {
            console.error('Failed to copy vendor directory:', err);
          }
        }
      }
    ]
    // 移除 external 配置，让 Tauri API 在开发模式下可用
  };
});