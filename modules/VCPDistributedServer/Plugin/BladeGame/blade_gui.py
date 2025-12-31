import tkinter as tk
from tkinter import messagebox
import json
import os
import sys
from PIL import Image, ImageTk
import time

# ---------------------------------------------------------
# 路径配置
# ---------------------------------------------------------
# 假设结构: VCPDistributedServer/Plugin/BladeGame/blade_gui.py
# 目标: AppData/UserData/user_avatar.png
# 目标: AppData/avatarimage/xxx.png

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(CURRENT_DIR, "game_state.json")

# 尝试定位主程序根目录
# 向上找3层：Plugin -> VCPDistributedServer -> Root
ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", "..", ".."))

USER_AVATAR_PATH = os.path.join(ROOT_DIR, "AppData", "UserData", "user_avatar.png")
AI_AVATAR_DIR = os.path.join(ROOT_DIR, "AppData", "avatarimage")

# ---------------------------------------------------------
# 游戏常量
# ---------------------------------------------------------
MOVES_INFO = {
    "Charge": {"name": "蓄势", "cost": 0, "desc": "能量+1 (无敌身)"},
    "Slash": {"name": "斩击", "cost": 0, "desc": "1伤 (0消耗)"},
    "LightStep": {"name": "轻霜踏雪", "cost": 1, "desc": "2伤 (1消耗)"},
    "PlumBlossom": {"name": "寒梅逐鹿", "cost": 2, "desc": "4伤+1回血 (2消耗)"},
    "Flash": {"name": "回光无影", "cost": 3, "desc": "9伤 (3消耗)"},
    "Block": {"name": "御剑格挡", "cost": 0, "desc": "减免4伤"},
    "Taiji": {"name": "太极两仪", "cost": 0, "desc": "免疫回光无影"}
}

class BladeGameApp:
    def __init__(self, root):
        self.root = root
        self.root.title("华山论剑 - VCP Blade Game")
        self.root.geometry("600x500")
        self.root.resizable(False, False)
        
        # 状态缓存
        self.last_modify_time = 0
        self.state = {}
        
        self.load_images()
        self.create_widgets()
        
        # 启动轮询循环，每500ms检查一次文件变化
        self.root.after(500, self.poll_state)

    def load_images(self):
        # 默认头像占位
        self.default_img = ImageTk.PhotoImage(Image.new('RGB', (100, 100), color='gray'))
        self.user_img = self.default_img
        self.ai_img = self.default_img
        
        # 加载用户头像
        if os.path.exists(USER_AVATAR_PATH):
            try:
                img = Image.open(USER_AVATAR_PATH).resize((100, 100))
                self.user_img = ImageTk.PhotoImage(img)
            except:
                pass
                
    def load_ai_avatar(self, maid_name):
        # 尝试加载AI头像
        path = os.path.join(AI_AVATAR_DIR, f"{maid_name}.png")
        if os.path.exists(path):
            try:
                img = Image.open(path).resize((100, 100))
                self.ai_img_label.config(image=ImageTk.PhotoImage(img))
                self.ai_img_label.image = ImageTk.PhotoImage(img) # keep reference
            except:
                pass

    def create_widgets(self):
        # 顶部：信息栏
        self.info_frame = tk.Frame(self.root, pady=10)
        self.info_frame.pack(fill="x")
        
        # 左侧：用户
        self.user_frame = tk.Frame(self.info_frame)
        self.user_frame.pack(side="left", padx=20)
        
        tk.Label(self.user_frame, text="大侠 (您)").pack()
        self.user_img_label = tk.Label(self.user_frame, image=self.user_img)
        self.user_img_label.pack()
        self.user_hp_label = tk.Label(self.user_frame, text="HP: 5/6", font=("Arial", 12, "bold"), fg="green")
        self.user_hp_label.pack()
        self.user_en_label = tk.Label(self.user_frame, text="剑气: 0/6", font=("Arial", 12, "bold"), fg="blue")
        self.user_en_label.pack()

        # 中间：VS
        tk.Label(self.info_frame, text="VS", font=("Arial", 20)).pack(side="left", padx=20)

        # 右侧：AI
        self.ai_frame = tk.Frame(self.info_frame)
        self.ai_frame.pack(side="right", padx=20)
        
        self.ai_name_label = tk.Label(self.ai_frame, text="等待连接...")
        self.ai_name_label.pack()
        self.ai_img_label = tk.Label(self.ai_frame, image=self.default_img)
        self.ai_img_label.pack()
        self.ai_hp_label = tk.Label(self.ai_frame, text="HP: 5/6", font=("Arial", 12, "bold"), fg="green")
        self.ai_hp_label.pack()
        self.ai_en_label = tk.Label(self.ai_frame, text="剑气: 0/6", font=("Arial", 12, "bold"), fg="blue")
        self.ai_en_label.pack()

        # 中部：战斗日志
        self.log_text = tk.Label(self.root, text="等待游戏开始...", wraplength=500, justify="center", bg="#f0f0f0", height=4)
        self.log_text.pack(pady=10, fill="x")

        # 底部：控制区
        self.control_frame = tk.Frame(self.root)
        self.control_frame.pack(pady=10)
        
        self.status_label = tk.Label(self.root, text="等待回合...", fg="gray")
        self.status_label.pack()

        # 技能按钮网格
        moves = [
            ("Charge", 0, 0), ("Slash", 0, 1), ("LightStep", 0, 2),
            ("PlumBlossom", 1, 0), ("Flash", 1, 1), 
            ("Block", 2, 0), ("Taiji", 2, 1)
        ]
        
        self.buttons = {}
        for key, r, c in moves:
            info = MOVES_INFO[key]
            text = f"{info['name']}\n{info['desc']}"
            btn = tk.Button(self.control_frame, text=text, width=15, height=2,
                            command=lambda k=key: self.on_move_click(k))
            btn.grid(row=r, column=c, padx=5, pady=5)
            self.buttons[key] = btn

    def poll_state(self):
        """轮询状态文件"""
        if os.path.exists(STATE_FILE):
            try:
                mtime = os.path.getmtime(STATE_FILE)
                if mtime != self.last_modify_time:
                    self.last_modify_time = mtime
                    with open(STATE_FILE, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    self.update_ui(data)
            except Exception as e:
                print(f"Read error: {e}")
        
        self.root.after(500, self.poll_state)

    def update_ui(self, state):
        self.state = state
        
        # 更新基本信息
        self.ai_name_label.config(text=state.get("maid_name", "AI"))
        # 尝试一次性加载AI头像
        if state.get("maid_name") and str(self.ai_img_label.cget("image")) == str(self.default_img):
            self.load_ai_avatar(state.get("maid_name"))

        # 更新数值
        self.user_hp_label.config(text=f"HP: {state['user_hp']}/6")
        self.user_en_label.config(text=f"剑气: {state['user_energy']}/6")
        
        self.ai_hp_label.config(text=f"HP: {state['ai_hp']}/6")
        self.ai_en_label.config(text=f"剑气: {state['ai_energy']}/6")
        
        # 更新日志
        self.log_text.config(text=state.get("last_log", ""))

        # 状态控制
        if state.get("game_over"):
            self.status_label.config(text="游戏结束", fg="red")
            self.disable_all_buttons()
        elif state.get("user_ready"):
            self.status_label.config(text="等待 AI 出招...", fg="orange")
            self.disable_all_buttons()
        else:
            self.status_label.config(text="请选择你的招式", fg="green")
            self.enable_buttons_by_energy(state['user_energy'])

    def on_move_click(self, move_key):
        if not self.state or self.state.get("user_ready"):
            return

        # 更新状态文件，标记 user_ready = True
        self.state['user_input'] = move_key
        self.state['user_ready'] = True
        
        try:
            with open(STATE_FILE, 'w', encoding='utf-8') as f:
                json.dump(self.state, f, ensure_ascii=False, indent=2)
            # 手动触发一次UI刷新以禁用按钮
            self.update_ui(self.state)
        except Exception as e:
            messagebox.showerror("错误", f"无法写入状态文件: {e}")

    def disable_all_buttons(self):
        for btn in self.buttons.values():
            btn.config(state="disabled")

    def enable_buttons_by_energy(self, current_energy):
        for key, btn in self.buttons.items():
            cost = MOVES_INFO[key]['cost']
            if current_energy >= cost:
                btn.config(state="normal")
            else:
                btn.config(state="disabled")

if __name__ == "__main__":
    # 如果状态文件不存在，先创建一个空的防止报错（或等待StartGame创建）
    root = tk.Tk()
    app = BladeGameApp(root)
    root.mainloop()