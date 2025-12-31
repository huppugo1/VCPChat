import tkinter as tk
from tkinter import font, ttk
import sys
import base64
import subprocess
import ctypes

def is_admin():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

class ModernConfirmDialog:
    def __init__(self, command):
        self.result = False
        self.root = tk.Tk()
        self.root.title("管理员权限确认")
        
        # 窗口设置
        window_width = 700
        window_height = 500
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        x = (screen_width - window_width) // 2
        y = (screen_height - window_height) // 2
        self.root.geometry(f"{window_width}x{window_height}+{x}+{y}")
        self.root.resizable(False, False)
        
        # 移除默认边框，创建自定义窗口
        self.root.overrideredirect(True)
        
        # 主题颜色
        self.colors = {
            'bg': '#1e1e2e',
            'surface': '#2a2a3e',
            'primary': '#89b4fa',
            'primary_hover': '#a6c8ff',
            'danger': '#f38ba8',
            'danger_hover': '#f5a8c0',
            'text': '#cdd6f4',
            'text_secondary': '#a6adc8',
            'border': '#45475a',
            'warning': '#fab387',
            'code_bg': '#181825'
        }
        
        self.root.configure(bg=self.colors['bg'])
        self.setup_ui(command)
        
        # 窗口阴影效果（仅在Windows 10+）
        try:
            self.root.attributes('-alpha', 0.0)
            self.root.after(10, lambda: self.fade_in())
        except:
            pass
    
    def fade_in(self):
        """淡入动画"""
        alpha = self.root.attributes('-alpha')
        if alpha < 1.0:
            self.root.attributes('-alpha', alpha + 0.1)
            self.root.after(20, self.fade_in)
    
    def setup_ui(self, command):
        # 主容器
        main_frame = tk.Frame(self.root, bg=self.colors['bg'], highlightthickness=2, 
                             highlightbackground=self.colors['border'])
        main_frame.pack(fill='both', expand=True, padx=0, pady=0)
        
        # 标题栏
        titlebar = tk.Frame(main_frame, bg=self.colors['surface'], height=50)
        titlebar.pack(fill='x', padx=0, pady=0)
        titlebar.pack_propagate(False)
        
        # 标题图标和文字
        title_content = tk.Frame(titlebar, bg=self.colors['surface'])
        title_content.pack(side='left', fill='both', expand=True, padx=20, pady=10)
        
        # 警告图标
        icon_label = tk.Label(title_content, text="⚠️", font=('Segoe UI Emoji', 20),
                             bg=self.colors['surface'], fg=self.colors['warning'])
        icon_label.pack(side='left', padx=(0, 15))
        
        # 标题文字
        title_label = tk.Label(title_content, text="管理员权限请求",
                              font=('Microsoft YaHei UI', 16, 'bold'),
                              bg=self.colors['surface'], fg=self.colors['text'])
        title_label.pack(side='left')
        
        # 关闭按钮
        close_btn = tk.Label(titlebar, text="✕", font=('Arial', 16),
                            bg=self.colors['surface'], fg=self.colors['text_secondary'],
                            cursor='hand2', padx=15)
        close_btn.pack(side='right', fill='y')
        close_btn.bind('<Button-1>', lambda e: self.on_cancel())
        close_btn.bind('<Enter>', lambda e: close_btn.configure(bg=self.colors['danger'], 
                                                                fg='white'))
        close_btn.bind('<Leave>', lambda e: close_btn.configure(bg=self.colors['surface'], 
                                                                fg=self.colors['text_secondary']))
        
        # 允许拖动窗口
        titlebar.bind('<Button-1>', self.start_move)
        titlebar.bind('<B1-Motion>', self.on_move)
        title_content.bind('<Button-1>', self.start_move)
        title_content.bind('<B1-Motion>', self.on_move)
        title_label.bind('<Button-1>', self.start_move)
        title_label.bind('<B1-Motion>', self.on_move)
        icon_label.bind('<Button-1>', self.start_move)
        icon_label.bind('<B1-Motion>', self.on_move)

        # 按钮区域 (先创建并放置在底部)
        button_frame = tk.Frame(main_frame, bg=self.colors['bg'])
        button_frame.pack(side='bottom', fill='x', padx=30, pady=20)
        
        # 内容区域 (在按钮区域之后创建，它会填充剩余空间)
        content_frame = tk.Frame(main_frame, bg=self.colors['bg'])
        content_frame.pack(fill='both', expand=True, padx=30, pady=20)
        
        # 提示信息
        info_frame = tk.Frame(content_frame, bg=self.colors['surface'], 
                             highlightthickness=1, highlightbackground=self.colors['border'])
        info_frame.pack(fill='x', pady=(0, 20))
        
        info_text = tk.Label(info_frame, 
                            text="🤖 AI 助手请求执行以下命令，需要管理员权限：",
                            font=('Microsoft YaHei UI', 10),
                            bg=self.colors['surface'], fg=self.colors['text'],
                            pady=15, padx=20, anchor='w')
        info_text.pack(fill='x')
        
        # 命令显示区域
        cmd_label = tk.Label(content_frame, text="命令内容：",
                           font=('Microsoft YaHei UI', 9, 'bold'),
                           bg=self.colors['bg'], fg=self.colors['text_secondary'],
                           anchor='w')
        cmd_label.pack(fill='x', pady=(0, 5))
        
        cmd_frame = tk.Frame(content_frame, bg=self.colors['code_bg'],
                           highlightthickness=1, highlightbackground=self.colors['border'])
        cmd_frame.pack(fill='both', expand=True)
        
        # 使用ttk创建可样式化的滚动条
        style = ttk.Style(self.root)
        style.theme_use('clam') # 使用一个允许自定义的现代主题

        # 自定义滚动条样式
        style.configure("Modern.Vertical.TScrollbar",
                        gripcount=0,
                        background=self.colors['surface'],
                        darkcolor=self.colors['surface'],
                        lightcolor=self.colors['surface'],
                        troughcolor=self.colors['code_bg'],
                        bordercolor=self.colors['border'],
                        arrowcolor=self.colors['text_secondary'])
        
        # 定义鼠标悬停和按下时的颜色
        style.map("Modern.Vertical.TScrollbar",
                  background=[('active', self.colors['primary']), ('!active', self.colors['surface'])],
                  arrowcolor=[('pressed', self.colors['primary']), ('!pressed', self.colors['text_secondary'])])

        cmd_scrollbar = ttk.Scrollbar(cmd_frame, orient='vertical', style="Modern.Vertical.TScrollbar")
        cmd_scrollbar.pack(side='right', fill='y', padx=(0, 5), pady=5)
        
        cmd_text = tk.Text(cmd_frame, wrap='word', font=('Consolas', 10),
                          bg=self.colors['code_bg'], fg=self.colors['primary'],
                          insertbackground=self.colors['primary'],
                          selectbackground=self.colors['primary'],
                          selectforeground=self.colors['code_bg'],
                          relief='flat', padx=15, pady=15,
                          yscrollcommand=cmd_scrollbar.set)
        cmd_text.pack(side='left', fill='both', expand=True)
        cmd_scrollbar.config(command=cmd_text.yview)
        
        cmd_text.insert('1.0', command)
        cmd_text.config(state='disabled')
        
        # 警告提示
        warning_frame = tk.Frame(content_frame, bg=self.colors['bg'])
        warning_frame.pack(fill='x', pady=(15, 0))
        
        warning_label = tk.Label(warning_frame,
                                text="⚡ 警告：只有在您信任此操作的情况下才应允许执行",
                                font=('Microsoft YaHei UI', 9),
                                bg=self.colors['bg'], fg=self.colors['warning'],
                                anchor='w')
        warning_label.pack(fill='x')
        
        # 取消按钮
        cancel_btn = tk.Frame(button_frame, bg=self.colors['surface'], 
                             highlightthickness=1, highlightbackground=self.colors['border'],
                             cursor='hand2')
        cancel_btn.pack(side='right', padx=(10, 0))
        
        cancel_label = tk.Label(cancel_btn, text="✕  取消", 
                               font=('Microsoft YaHei UI', 11),
                               bg=self.colors['surface'], fg=self.colors['text'],
                               padx=30, pady=12, cursor='hand2')
        cancel_label.pack()
        
        cancel_btn.bind('<Button-1>', lambda e: self.on_cancel())
        cancel_label.bind('<Button-1>', lambda e: self.on_cancel())
        cancel_btn.bind('<Enter>', lambda e: self.on_button_hover(cancel_btn, cancel_label, 
                                                                   self.colors['danger']))
        cancel_btn.bind('<Leave>', lambda e: self.on_button_leave(cancel_btn, cancel_label))
        cancel_label.bind('<Enter>', lambda e: self.on_button_hover(cancel_btn, cancel_label, 
                                                                     self.colors['danger']))
        cancel_label.bind('<Leave>', lambda e: self.on_button_leave(cancel_btn, cancel_label))
        
        # 允许按钮
        allow_btn = tk.Frame(button_frame, bg=self.colors['primary'],
                           cursor='hand2')
        allow_btn.pack(side='right')
        
        allow_label = tk.Label(allow_btn, text="✓  允许执行",
                             font=('Microsoft YaHei UI', 11, 'bold'),
                             bg=self.colors['primary'], fg='#000000',
                             padx=30, pady=12, cursor='hand2')
        allow_label.pack()
        
        allow_btn.bind('<Button-1>', lambda e: self.on_allow())
        allow_label.bind('<Button-1>', lambda e: self.on_allow())
        allow_btn.bind('<Enter>', lambda e: self.on_button_hover(allow_btn, allow_label,
                                                                  self.colors['primary_hover']))
        allow_btn.bind('<Leave>', lambda e: self.on_button_leave(allow_btn, allow_label, 
                                                                  is_primary=True))
        allow_label.bind('<Enter>', lambda e: self.on_button_hover(allow_btn, allow_label,
                                                                    self.colors['primary_hover']))
        allow_label.bind('<Leave>', lambda e: self.on_button_leave(allow_btn, allow_label,
                                                                    is_primary=True))
    
    def on_button_hover(self, btn_frame, btn_label, hover_color):
        btn_frame.configure(bg=hover_color)
        btn_label.configure(bg=hover_color)
    
    def on_button_leave(self, btn_frame, btn_label, is_primary=False):
        if is_primary:
            btn_frame.configure(bg=self.colors['primary'])
            btn_label.configure(bg=self.colors['primary'])
        else:
            btn_frame.configure(bg=self.colors['surface'])
            btn_label.configure(bg=self.colors['surface'])
    
    def start_move(self, event):
        self.x = event.x
        self.y = event.y
    
    def on_move(self, event):
        deltax = event.x - self.x
        deltay = event.y - self.y
        x = self.root.winfo_x() + deltax
        y = self.root.winfo_y() + deltay
        self.root.geometry(f"+{x}+{y}")
    
    def on_allow(self):
        self.result = True
        self.root.quit()
    
    def on_cancel(self):
        self.result = False
        self.root.quit()
    
    def show(self):
        self.root.mainloop()
        self.root.destroy()
        return self.result

def main():
    if not is_admin():
        try:
            ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, 
                                               " ".join(sys.argv), None, 1)
        except Exception as e:
            pass
        sys.exit(0)

    if len(sys.argv) < 2:
        sys.exit(1)

    try:
        base64_command = sys.argv[1]
        decoded_command = base64.b64decode(base64_command).decode('utf-8')
    except Exception as e:
        sys.exit(1)

    # 显示现代化确认对话框
    dialog = ModernConfirmDialog(decoded_command)
    user_confirmed = dialog.show()
    
    if user_confirmed:
        try:
            subprocess.Popen(
                ['powershell.exe', '-NoExit', '-Command', decoded_command],
                creationflags=subprocess.CREATE_NEW_CONSOLE
            )
        except Exception as e:
            # 如果执行失败，可以考虑显示错误对话框
            pass

if __name__ == "__main__":
    main()