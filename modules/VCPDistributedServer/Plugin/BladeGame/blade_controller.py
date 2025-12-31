import sys
import json
import os
import subprocess
import time

# ---------------------------------------------------------
# 配置路径与常量
# ---------------------------------------------------------
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(CURRENT_DIR, "game_state.json")
GUI_SCRIPT = os.path.join(CURRENT_DIR, "blade_gui.py")

# 动作定义与消耗
MOVES = {
    "Charge": {"cost": 0, "type": "buff", "level": 0, "name": "蓄势"},
    "Slash": {"cost": 0, "type": "attack", "level": 1, "dmg": 1, "name": "斩击"},
    "LightStep": {"cost": 1, "type": "attack", "level": 2, "dmg": 2, "name": "轻霜踏雪"},
    "PlumBlossom": {"cost": 2, "type": "attack", "level": 3, "dmg": 4, "heal": 1, "name": "寒梅逐鹿"},
    "Flash": {"cost": 3, "type": "attack", "level": 4, "dmg": 9, "name": "回光无影"},
    "Block": {"cost": 0, "type": "defense", "level": 0, "name": "御剑格挡"},
    "Taiji": {"cost": 0, "type": "defense", "level": 0, "name": "太极两仪"}
}

def load_state():
    if not os.path.exists(STATE_FILE):
        return None
    try:
        with open(STATE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return None

def save_state(data):
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def launch_gui():
    """启动独立的GUI进程，不随本脚本退出而关闭"""
    # Windows下使用 creationflags 使得子进程独立
    if sys.platform == 'win32':
        DETACHED_PROCESS = 0x00000008
        subprocess.Popen([sys.executable, GUI_SCRIPT], creationflags=DETACHED_PROCESS, shell=False, close_fds=True)
    else:
        # Linux/Mac (虽然VCP主要是Windows，为了兼容性写上)
        subprocess.Popen([sys.executable, GUI_SCRIPT], start_new_session=True, close_fds=True)

def resolve_turn(state, ai_action_key):
    """
    核心战斗逻辑结算
    """
    user_action_key = state['user_input']
    
    # 获取动作数据
    ai_move = MOVES.get(ai_action_key)
    user_move = MOVES.get(user_action_key)
    
    if not ai_move:
        return "Error: AI动作为空或非法"
    
    # 扣除能量
    state['ai_energy'] -= ai_move['cost']
    state['user_energy'] -= user_move['cost'] # 假设GUI已经校验过能否释放
    
    # 记录本回合动作名称
    log_msg = f"第 {state['turn']} 回合: AI[{ai_move['name']}] vs 用户[{user_move['name']}]。"
    
    # --- 结算逻辑 ---
    
    ai_dmg_deal = 0
    user_dmg_deal = 0
    ai_heal = 0
    user_heal = 0
    
    # 1. 处理蓄势 (获得能量)
    if ai_action_key == "Charge":
        state['ai_energy'] = min(6, state['ai_energy'] + 1)
    if user_action_key == "Charge":
        state['user_energy'] = min(6, state['user_energy'] + 1)

    # 2. 攻击判定 (拼刀逻辑)
    # 规则：高级攻击打断低级攻击。同级攻击互相抵消。
    ai_attack_success = False
    user_attack_success = False
    
    # 判断AI是否在攻击
    if ai_move['type'] == 'attack':
        if user_move['type'] == 'attack':
            # 双方对刀
            if ai_move['level'] > user_move['level']:
                ai_attack_success = True # 用户被打断
                log_msg += " AI招式更胜一筹，打断了用户！"
            elif user_move['level'] > ai_move['level']:
                user_attack_success = True # AI被打断
                log_msg += " 用户招式凌厉，打断了AI！"
            else:
                # 拼刀抵消，但特殊效果(回血)可能保留
                log_msg += " 双方剑锋相交，不论伯仲！"
                # 寒梅逐鹿的特殊规则：抵消时回血依然生效吗？规则说"恢复效果不会被打断"
                if ai_action_key == 'PlumBlossom': ai_heal = ai_move['heal']
                if user_action_key == 'PlumBlossom': user_heal = user_move['heal']
        else:
            # 用户没攻击（防御或蓄势），AI攻击生效
            ai_attack_success = True
            
    # 判断用户是否在攻击
    if user_move['type'] == 'attack':
        if ai_move['type'] != 'attack':
            # AI没攻击，用户攻击生效
            user_attack_success = True

    # 3. 计算原始伤害
    if ai_attack_success:
        ai_dmg_deal = ai_move['dmg']
        if 'heal' in ai_move: ai_heal = ai_move['heal']
        
    if user_attack_success:
        user_dmg_deal = user_move['dmg']
        if 'heal' in user_move: user_heal = user_move['heal']
        
    # 4. 防御结算
    # 用户的防御
    if user_action_key == 'Block' and ai_attack_success:
        original = ai_dmg_deal
        ai_dmg_deal = max(0, ai_dmg_deal - 4)
        if ai_dmg_deal < original:
            log_msg += " 用户格挡了部分伤害。"
            
    if user_action_key == 'Taiji' and ai_attack_success:
        if ai_action_key == 'Flash':
            ai_dmg_deal = 0
            log_msg += " 用户太极化解了回光无影！"
    
    # AI的防御
    if ai_action_key == 'Block' and user_attack_success:
        original = user_dmg_deal
        user_dmg_deal = max(0, user_dmg_deal - 4)
        if user_dmg_deal < original:
            log_msg += " AI格挡了部分伤害。"

    if ai_action_key == 'Taiji' and user_attack_success:
        if user_action_key == 'Flash':
            user_dmg_deal = 0
            log_msg += " AI太极化解了回光无影！"

    # 5. 应用数值
    state['ai_hp'] = min(6, state['ai_hp'] + ai_heal - user_dmg_deal)
    state['user_hp'] = min(6, state['user_hp'] + user_heal - ai_dmg_deal)
    
    # 记录结果
    turn_result = f"结果: AI造成{ai_dmg_deal}伤害(回复{ai_heal})，用户造成{user_dmg_deal}伤害(回复{user_heal})。"
    
    # 更新状态
    state['turn'] += 1
    state['user_ready'] = False
    state['last_ai_move'] = ai_action_key
    state['last_user_move'] = user_action_key
    state['last_log'] = log_msg + " " + turn_result
    
    # 检查游戏结束
    game_over_msg = ""
    if state['ai_hp'] <= 0 and state['user_hp'] <= 0:
        state['game_over'] = True
        game_over_msg = "双方力竭倒地，平局！"
    elif state['ai_hp'] <= 0:
        state['game_over'] = True
        game_over_msg = "AI败北，恭喜大侠获胜！"
    elif state['user_hp'] <= 0:
        state['game_over'] = True
        game_over_msg = "胜负已分，AI获胜！"
        
    if state['game_over']:
        state['last_log'] += " " + game_over_msg

    save_state(state)
    return f"{log_msg} {turn_result} {game_over_msg} 当前状态: AI HP:{state['ai_hp']}/EN:{state['ai_energy']}, User HP:{state['user_hp']}/EN:{state['user_energy']}。该回合已结束，请等待用户下一回合决策，并隐藏你的决策以进行博弈。（用户无法得知你输入的指令内容）"

def main():
    # 读取 stdin
    try:
        input_data = sys.stdin.read()
        request = json.loads(input_data)
    except Exception as e:
        # 如果是本地调试，可能没有stdin，这里做个兼容
        request = {} 

    # 提取 command (VCP标准可能将参数直接平铺，或者放在特定的key里，这里假设VCP已经解析好)
    # 根据手册，plugin.js 会解析并将参数平铺。如果有多条指令，会有 command1, command2 等。
    # 这里我们只处理单条指令逻辑，或者标准的 VCP Tool Call 结构。
    
    command = request.get('command')
    
    # 构建初始响应
    response = {"status": "success", "result": ""}

    if command == "StartGame":
        maid_name = request.get('maid', 'AI')
        
        # 初始化状态
        initial_state = {
            "maid_name": maid_name,
            "turn": 1,
            "ai_hp": 5,
            "ai_energy": 0,
            "user_hp": 5,
            "user_energy": 0,
            "game_over": False,
            "user_ready": False, # 关键：用户是否点击了按钮
            "user_input": None,
            "last_ai_move": None,
            "last_user_move": None,
            "last_log": "游戏开始！请出招。"
        }
        save_state(initial_state)
        
        # 启动GUI
        launch_gui()
        
        response["result"] = f"游戏GUI已启动，对手是 {maid_name}。初始状态：双方5血0气。请等待用户输入指令后，再次调用 PlayTurn。"

    elif command == "PlayTurn":
        state = load_state()
        if not state:
            response["status"] = "error"
            response["result"] = "错误：游戏尚未创建，请先调用 StartGame。"
        elif state['game_over']:
             response["result"] = f"游戏已结束。{state['last_log']}"
        elif not state['user_ready']:
            # 关键逻辑：如果用户没准备好，拒绝AI的行动
            response["result"] = "SYSTEM_WAIT: 用户尚未在GUI中输入指令（决策未准备）。请不要进行任何操作，回复用户‘请大侠出招’，并等待用户操作完成后再次调用此工具。"
        else:
            # 用户已准备，执行回合
            ai_action = request.get('action')
            
            # 简单的合法性检查
            current_en = state['ai_energy']
            needed_en = MOVES.get(ai_action, {'cost': 0})['cost']
            
            if current_en < needed_en:
                # AI犯蠢了，能量不足，强制转为 Charge
                ai_action = "Charge"
                reason = "AI原定策略能量不足，强制转为蓄势。"
            
            result_text = resolve_turn(state, ai_action)
            response["result"] = result_text

    else:
        response["status"] = "error"
        response["result"] = f"未知指令: {command}"

    print(json.dumps(response))

if __name__ == "__main__":
    main()