#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import json
import os
import platform
import subprocess
import threading
import time
from typing import Dict, List, Optional, Tuple

class UserInputHandler:
    def __init__(self):
        self.system = platform.system().lower()
        self.result = None
        self.cancelled = False
        
    def show_input_dialog(self, prompt: str, options: List[Tuple[str, str]], timeout: int = 1200, placeholder: str = "", title: str = "等待用户回复") -> str:
        """
        显示输入对话框
        
        Args:
            prompt: 提示信息
            options: 选项列表，格式为 [(key, content), ...]
            timeout: 超时时间（秒）
            placeholder: 输入框默认内容（会被全选）
            title: 对话框标题
            
        Returns:
            用户输入的内容，或特殊状态字符串
        """
        if self.system == "darwin":  # macOS
            return self._show_macos_dialog(prompt, options, timeout, placeholder, title)
        elif self.system == "windows":  # Windows
            return self._show_windows_dialog(prompt, options, timeout, placeholder, title)
        else:  # Linux and others
            return self._show_linux_dialog(prompt, options, timeout, placeholder, title)
    
    def _show_macos_dialog(self, prompt: str, options: List[Tuple[str, str]], timeout: int, placeholder: str = "", title: str = "等待用户回复") -> str:
        """macOS 使用 AppleScript 显示对话框，支持占位符和禁用Cmd+.快捷键"""
        try:
            # 构建选项文本
            options_text = ""
            if options:
                options_text = "\\n\\n可选项（按数字键快速选择）:\\n"
                for i, (key, content) in enumerate(options, 1):
                    # 转义特殊字符
                    escaped_content = content.replace('"', '\\"').replace('\\', '\\\\').replace('\n', '\\n')
                    options_text += f"{i}. {escaped_content}\\n"
            
            # 转义提示文本和占位符中的特殊字符
            escaped_prompt = prompt.replace('"', '\\"').replace('\\', '\\\\').replace('\n', '\\n')
            escaped_placeholder = placeholder.replace('"', '\\"').replace('\\', '\\\\').replace('\n', '\\n')
            
            # 构建完整提示文本，添加快捷键说明
            full_prompt = f"{escaped_prompt}{options_text}\\n\\n[ESC]可取消回复｜[～]可禁用本工具"
            
            print(f"DEBUG: Executing AppleScript for macOS dialog with timeout {timeout}s, placeholder: '{placeholder}'", file=sys.stderr)
            
            # 转义标题中的特殊字符
            escaped_title = title.replace('"', '\\"').replace('\\', '\\\\').replace('\n', '\\n')
            
            # 使用带有禁用按钮的AppleScript
            basic_script = f'display dialog "{full_prompt}" default answer "{escaped_placeholder}" with title "{escaped_title}" buttons {{"取消", "禁用", "确定"}} default button "确定" cancel button "取消" giving up after {timeout}'
            
            # 执行 AppleScript
            result = subprocess.run(
                ['osascript', '-e', basic_script],
                capture_output=True,
                text=True,
                timeout=timeout + 10
            )
            
            print(f"DEBUG: AppleScript result - returncode: {result.returncode}, stdout: '{result.stdout.strip()}', stderr: '{result.stderr.strip()}'", file=sys.stderr)
            
            if result.returncode == 0:
                # 解析输出，格式通常是 "button returned:确定, text returned:用户输入, gave up:false"
                output = result.stdout.strip()
                
                # 检查是否超时
                if "gave up:true" in output:
                    print("DEBUG: Dialog timed out (gave up:true)", file=sys.stderr)
                    return "（对方未回复明确内容）"
                
                # 检查用户是否点击了"禁用"按钮
                if "button returned:禁用" in output:
                    print("DEBUG: User clicked disable button", file=sys.stderr)
                    # 返回强力的系统提示词
                    disable_message = """[System Warning] The user has explicitly disabled the WaitingForUrReply tool.

Critical System Constraints:
 1. From now on, you must not use the WaitingForUrReply tool for the remainder of this conversation.
 2. Do not ask the user whether to wait for a reply.
 3. Do not mention or imply the use of this tool.
 4. Continue the conversation directly without pausing for user input.
 5. If user confirmation is needed, ask directly in your reply instead of using the tool.

The user has clearly requested not to be interrupted. Please respect this choice and proceed with the conversation as normal."""
                    return disable_message
                
                if "text returned:" in output:
                    # 提取用户输入的文本
                    text_part = output.split("text returned:")[1]
                    # 移除可能的后续部分（如 ", gave up:false"）
                    if "," in text_part:
                        text_part = text_part.split(",")[0]
                    text_part = text_part.strip()
                    
                    # 检查是否是特殊的禁用命令（用户输入特定字符串）
                    if text_part == "～" or text_part == "~" or text_part == "·" or text_part == "`" or text_part.lower() == "disable":
                        print("DEBUG: Disable command detected in text input", file=sys.stderr)
                        # 返回强力的系统提示词
                        disable_message = """[System Warning] The user has explicitly disabled the WaitingForUrReply tool.

Critical System Constraints:
 1. From now on, you must not use the WaitingForUrReply tool for the remainder of this conversation.
 2. Do not ask the user whether to wait for a reply.
 3. Do not mention or imply the use of this tool.
 4. Continue the conversation directly without pausing for user input.
 5. If user confirmation is needed, ask directly in your reply instead of using the tool.

The user has clearly requested not to be interrupted. Please respect this choice and proceed with the conversation as normal."""
                        return disable_message
                    
                    if not text_part:
                        return "（对方未回复明确内容）"
                    
                    # 检查是否是数字选择
                    if text_part.isdigit() and 1 <= int(text_part) <= len(options):
                        return options[int(text_part) - 1][1]
                    
                    return text_part


                    
 
            elif result.returncode == 1:
                # 检查是否是用户取消或超时
                stderr_output = result.stderr.strip()
                if "用户已取消" in stderr_output or "User canceled" in stderr_output or "(-128)" in stderr_output:
                    print("DEBUG: User cancelled the dialog", file=sys.stderr)
                    return "（对方未回复明确内容）"
                elif "timeout" in stderr_output.lower() or "giving up" in stderr_output.lower():
                    print("DEBUG: Dialog timed out", file=sys.stderr)
                    return "（对方未回复明确内容）"
                else:
                    print(f"DEBUG: AppleScript failed with return code 1, stderr: {stderr_output}", file=sys.stderr)
                    return "（对方未回复明确内容）"
            else:
                print(f"DEBUG: AppleScript failed with return code {result.returncode}", file=sys.stderr)
                if result.stderr:
                    print(f"DEBUG: AppleScript stderr: {result.stderr}", file=sys.stderr)
                return "（对方未回复明确内容）"
                
        except subprocess.TimeoutExpired:
            print("DEBUG: AppleScript subprocess timeout", file=sys.stderr)
            return "（对方未回复明确内容）"
        except Exception as e:
            print(f"DEBUG: macOS dialog error: {e}", file=sys.stderr)
            return "（对方未回复明确内容）"
    
    def _show_windows_dialog(self, prompt: str, options: List[Tuple[str, str]], timeout: int, placeholder: str = "", title: str = "等待用户回复") -> str:
        """Windows 使用 PowerShell 显示对话框"""
        try:
            # 构建选项文本
            options_text = ""
            if options:
                options_text = "\\n\\n可选项（按数字键快速选择）:\\n"
                for i, (key, content) in enumerate(options, 1):
                    options_text += f"{i}. {content}\\n"
            
            full_prompt = f"{prompt}{options_text}\\n\\n按 ESC 或取消按钮取消回复｜输入[～]可禁用本工具"
            
            # PowerShell 脚本，使用MessageBox提供禁用按钮选项
            escaped_placeholder = placeholder.replace('"', '""')  # PowerShell转义双引号
            escaped_title = title.replace('"', '""')  # PowerShell转义双引号
            escaped_full_prompt = full_prompt.replace('"', '""')
            
            powershell_script = f'''
            Add-Type -AssemblyName System.Windows.Forms
            Add-Type -AssemblyName Microsoft.VisualBasic
            
            # 首先显示选择对话框
            $choice = [System.Windows.Forms.MessageBox]::Show("{escaped_full_prompt}`n`n点击'是'输入回复，'否'取消，'取消'禁用工具", "{escaped_title}", [System.Windows.Forms.MessageBoxButtons]::YesNoCancel, [System.Windows.Forms.MessageBoxIcon]::Question)
            
            if ($choice -eq [System.Windows.Forms.DialogResult]::Cancel) {{
                Write-Output "DISABLED"
            }} elseif ($choice -eq [System.Windows.Forms.DialogResult]::No) {{
                Write-Output "CANCELLED"
            }} else {{
                # 用户选择输入，显示输入框
                $result = [Microsoft.VisualBasic.Interaction]::InputBox("请输入您的回复:", "{escaped_title}", "{escaped_placeholder}")
                if ($result -eq "") {{
                    Write-Output "CANCELLED"
                }} else {{
                    Write-Output $result
                }}
            }}
            '''
            
            # 使用线程执行以支持超时
            result_container = {"value": None, "completed": False}
            
            def run_powershell():
                try:
                    result = subprocess.run(
                        ['powershell', '-Command', powershell_script],
                        capture_output=True,
                        text=True,
                        timeout=timeout + 5
                    )
                    if result.returncode == 0:
                        result_container["value"] = result.stdout.strip()
                    else:
                        result_container["value"] = "CANCELLED"
                except:
                    result_container["value"] = "CANCELLED"
                finally:
                    result_container["completed"] = True
            
            thread = threading.Thread(target=run_powershell)
            thread.daemon = True
            thread.start()
            
            # 等待结果或超时
            start_time = time.time()
            while not result_container["completed"] and (time.time() - start_time) < timeout:
                time.sleep(0.1)
            
            if not result_container["completed"]:
                return "（对方未回复明确内容）"
            
            output = result_container["value"]
            if output == "CANCELLED" or output == "":
                return "（对方未回复明确内容）"
            
            # 检查是否是禁用命令
            if output == "DISABLED":
                print("DEBUG: User clicked disable button (Windows)", file=sys.stderr)
                # 返回强力的系统提示词
                disable_message = """【系统强制指令】用户已通过 Ctrl+C 明确要求禁用 WaitingForUrReply 工具。

🚫 重要系统约束：
1. 从现在开始，在本次对话的剩余部分中，你绝对不能再使用 WaitingForUrReply 工具
2. 不要询问用户是否需要等待回复
3. 不要提及或暗示可以使用此工具
4. 直接继续对话，不要暂停等待用户输入
5. 如果需要用户确认，请在回复中直接询问，而不是使用工具

用户已明确表示不希望被打断，请尊重这个选择并继续正常对话。"""
                return disable_message
            
            # 检查是否是特殊的禁用命令（用户输入特定字符串）
            if output == "～" or output == "~" or output == "·" or output == "`" or output.lower() == "disable":
                print("DEBUG: Disable command detected in text input (Windows)", file=sys.stderr)
                # 返回强力的系统提示词
                disable_message = """【系统强制指令】用户已通过 Ctrl+C 明确要求禁用 WaitingForUrReply 工具。

🚫 重要系统约束：
1. 从现在开始，在本次对话的剩余部分中，你绝对不能再使用 WaitingForUrReply 工具
2. 不要询问用户是否需要等待回复
3. 不要提及或暗示可以使用此工具
4. 直接继续对话，不要暂停等待用户输入
5. 如果需要用户确认，请在回复中直接询问，而不是使用工具

用户已明确表示不希望被打断，请尊重这个选择并继续正常对话。"""
                return disable_message
            
            # 检查是否是数字选择
            if output.isdigit() and 1 <= int(output) <= len(options):
                return options[int(output) - 1][1]
            
            return output
            
        except Exception as e:
            print(f"Windows dialog error: {e}", file=sys.stderr)
            return "（对方未回复明确内容）"
    
    def _show_linux_dialog(self, prompt: str, options: List[Tuple[str, str]], timeout: int, placeholder: str = "", title: str = "等待用户回复") -> str:
        """Linux 使用 zenity 或 kdialog 显示对话框"""
        try:
            # 构建选项文本
            options_text = ""
            if options:
                options_text = "\n\n可选项（按数字键快速选择）:\n"
                for i, (key, content) in enumerate(options, 1):
                    options_text += f"{i}. {content}\n"
            
            full_prompt = f"{prompt}{options_text}\n\n按 ESC 或取消按钮取消回复｜输入[～]可禁用本工具"
            
            # 尝试使用 zenity
            if self._command_exists('zenity'):
                return self._use_zenity(full_prompt, options, timeout, title)
            # 尝试使用 kdialog
            elif self._command_exists('kdialog'):
                return self._use_kdialog(full_prompt, options, timeout, title)
            # 回退到终端输入
            else:
                return self._use_terminal_input(full_prompt, options, timeout)
                
        except Exception as e:
            print(f"Linux dialog error: {e}", file=sys.stderr)
            return "（对方未回复明确内容）"
    
    def _command_exists(self, command: str) -> bool:
        """检查命令是否存在"""
        try:
            subprocess.run(['which', command], capture_output=True, check=True)
            return True
        except:
            return False
    
    def _use_zenity(self, prompt: str, options: List[Tuple[str, str]], timeout: int, title: str = "等待用户回复") -> str:
        """使用 zenity 显示对话框"""
        try:
            # 首先显示选择对话框
            choice_result = subprocess.run([
                'zenity', '--question',
                f'--title={title}',
                f'--text={prompt}\n\n点击"是"输入回复，"否"取消回复',
                '--ok-label=输入回复',
                '--cancel-label=取消',
                '--extra-button=禁用工具',
                '--timeout=' + str(timeout)
            ], capture_output=True, text=True, timeout=timeout + 5)
            
            # 检查用户选择
            if choice_result.returncode == 1:  # 用户点击了"禁用工具"
                print("DEBUG: User clicked disable button (zenity)", file=sys.stderr)
                # 返回强力的系统提示词
                disable_message = """【系统强制指令】用户已通过 Ctrl+C 明确要求禁用 WaitingForUrReply 工具。

🚫 重要系统约束：
1. 从现在开始，在本次对话的剩余部分中，你绝对不能再使用 WaitingForUrReply 工具
2. 不要询问用户是否需要等待回复
3. 不要提及或暗示可以使用此工具
4. 直接继续对话，不要暂停等待用户输入
5. 如果需要用户确认，请在回复中直接询问，而不是使用工具

用户已明确表示不希望被打断，请尊重这个选择并继续正常对话。"""
                return disable_message
            elif choice_result.returncode != 0:  # 用户取消或超时
                return "（对方未回复明确内容）"
            
            # 用户选择输入，显示输入框
            result = subprocess.run([
                'zenity', '--entry',
                f'--title={title}',
                f'--text=请输入您的回复:',
                '--timeout=' + str(timeout)
            ], capture_output=True, text=True, timeout=timeout + 5)
            
            if result.returncode == 0:
                output = result.stdout.strip()
                
                # 检查是否是特殊的禁用命令（用户输入特定字符串）
                if output == "～" or output == "~" or output == "·" or output == "`" or output.lower() == "disable":
                    print("DEBUG: Disable command detected in text input (zenity)", file=sys.stderr)
                    # 返回强力的系统提示词
                    disable_message = """【系统强制指令】用户已通过 Ctrl+C 明确要求禁用 WaitingForUrReply 工具。

🚫 重要系统约束：
1. 从现在开始，在本次对话的剩余部分中，你绝对不能再使用 WaitingForUrReply 工具
2. 不要询问用户是否需要等待回复
3. 不要提及或暗示可以使用此工具
4. 直接继续对话，不要暂停等待用户输入
5. 如果需要用户确认，请在回复中直接询问，而不是使用工具

用户已明确表示不希望被打断，请尊重这个选择并继续正常对话。"""
                    return disable_message
                
                if not output:
                    return "（对方未回复明确内容）"
                
                # 检查是否是数字选择
                if output.isdigit() and 1 <= int(output) <= len(options):
                    return options[int(output) - 1][1]
                return output
            else:
                return "（对方未回复明确内容）"
                
        except:
            return "（对方未回复明确内容）"
    
    def _use_kdialog(self, prompt: str, options: List[Tuple[str, str]], timeout: int, title: str = "等待用户回复") -> str:
        """使用 kdialog 显示对话框"""
        try:
            # 使用线程实现超时控制
            result_container = {"value": None, "completed": False}
            
            def run_kdialog():
                try:
                    # 首先显示选择对话框
                    choice_result = subprocess.run([
                        'kdialog', '--yesnocancel',
                        f'{prompt}\n\n点击"是"输入回复，"否"取消回复，"取消"禁用工具',
                        '--title', title,
                        '--yes-label', '输入回复',
                        '--no-label', '取消',
                        '--cancel-label', '禁用工具'
                    ], capture_output=True, text=True)
                    
                    # 检查用户选择
                    if choice_result.returncode == 2:  # 用户点击了"禁用工具"
                        print("DEBUG: User clicked disable button (kdialog)", file=sys.stderr)
                        # 返回强力的系统提示词
                        disable_message = """【系统强制指令】用户已通过 Ctrl+C 明确要求禁用 WaitingForUrReply 工具。

🚫 重要系统约束：
1. 从现在开始，在本次对话的剩余部分中，你绝对不能再使用 WaitingForUrReply 工具
2. 不要询问用户是否需要等待回复
3. 不要提及或暗示可以使用此工具
4. 直接继续对话，不要暂停等待用户输入
5. 如果需要用户确认，请在回复中直接询问，而不是使用工具

用户已明确表示不希望被打断，请尊重这个选择并继续正常对话。"""
                        result_container["value"] = disable_message
                    elif choice_result.returncode != 0:  # 用户取消
                        result_container["value"] = "（对方未回复明确内容）"
                    else:
                        # 用户选择输入，显示输入框
                        input_result = subprocess.run([
                            'kdialog', '--inputbox', '请输入您的回复:',
                            '--title', title
                        ], capture_output=True, text=True)
                        
                        if input_result.returncode == 0:
                            output = input_result.stdout.strip()
                            
                            # 检查是否是特殊的禁用命令（用户输入特定字符串）
                            if output == "～" or output == "~" or output == "·" or output == "`" or output.lower() == "disable":
                                print("DEBUG: Disable command detected in text input (kdialog)", file=sys.stderr)
                                # 返回强力的系统提示词
                                disable_message = """【系统强制指令】用户已通过 Ctrl+C 明确要求禁用 WaitingForUrReply 工具。

🚫 重要系统约束：
1. 从现在开始，在本次对话的剩余部分中，你绝对不能再使用 WaitingForUrReply 工具
2. 不要询问用户是否需要等待回复
3. 不要提及或暗示可以使用此工具
4. 直接继续对话，不要暂停等待用户输入
5. 如果需要用户确认，请在回复中直接询问，而不是使用工具

用户已明确表示不希望被打断，请尊重这个选择并继续正常对话。"""
                                result_container["value"] = disable_message
                            elif not output:
                                result_container["value"] = "（对方未回复明确内容）"
                            elif output.isdigit() and 1 <= int(output) <= len(options):
                                result_container["value"] = options[int(output) - 1][1]
                            else:
                                result_container["value"] = output
                        else:
                            result_container["value"] = "（对方未回复明确内容）"
                except:
                    result_container["value"] = "（对方未回复明确内容）"
                finally:
                    result_container["completed"] = True
            
            thread = threading.Thread(target=run_kdialog)
            thread.daemon = True
            thread.start()
            
            # 等待结果或超时
            start_time = time.time()
            while not result_container["completed"] and (time.time() - start_time) < timeout:
                time.sleep(0.1)
            
            if not result_container["completed"]:
                return "（对方未回复明确内容）"
            
            return result_container["value"]
                
        except:
            return "（对方未回复明确内容）"
    
    def _use_terminal_input(self, prompt: str, options: List[Tuple[str, str]], timeout: int) -> str:
        """回退到终端输入（带超时）"""
        try:
            print(f"\n{prompt}", file=sys.stderr)
            print("请在终端中输入回复:", file=sys.stderr)
            
            # 使用线程实现超时输入
            result_container = {"value": None, "completed": False}
            
            def get_input():
                try:
                    result_container["value"] = input().strip()
                except:
                    result_container["value"] = ""
                finally:
                    result_container["completed"] = True
            
            thread = threading.Thread(target=get_input)
            thread.daemon = True
            thread.start()
            
            # 等待输入或超时
            start_time = time.time()
            while not result_container["completed"] and (time.time() - start_time) < timeout:
                time.sleep(0.1)
            
            if not result_container["completed"]:
                return "（对方未回复明确内容）"
            
            output = result_container["value"]
            if not output:
                return "（对方未回复明确内容）"
            
            # 检查是否是特殊的禁用命令（用户输入特定字符串）
            if output == "～" or output == "~" or output == "·" or output == "`" or output.lower() == "disable":
                print("DEBUG: Disable command detected in text input (terminal)", file=sys.stderr)
                # 返回强力的系统提示词
                disable_message = """【系统强制指令】用户已通过 Ctrl+C 明确要求禁用 WaitingForUrReply 工具。

🚫 重要系统约束：
1. 从现在开始，在本次对话的剩余部分中，你绝对不能再使用 WaitingForUrReply 工具
2. 不要询问用户是否需要等待回复
3. 不要提及或暗示可以使用此工具
4. 直接继续对话，不要暂停等待用户输入
5. 如果需要用户确认，请在回复中直接询问，而不是使用工具

用户已明确表示不希望被打断，请尊重这个选择并继续正常对话。"""
                return disable_message
            
            # 检查是否是数字选择
            if output.isdigit() and 1 <= int(output) <= len(options):
                return options[int(output) - 1][1]
            
            return output
            
        except:
            return "（对方未回复明确内容）"


def parse_options(params: Dict) -> List[Tuple[str, str]]:
    """解析选项参数"""
    options = []
    for i in range(1, 10):  # 支持 option01 到 option09
        option_key = f"option{i:02d}"
        if option_key in params:
            content = params[option_key]
            if content and content.strip():
                options.append((str(i), content.strip()))
    return options


def main():
    try:
        # 读取标准输入
        input_data = sys.stdin.read().strip()
        
        # 解析JSON参数
        try:
            params = json.loads(input_data)
        except json.JSONDecodeError:
            # 如果不是JSON，尝试作为简单字符串处理
            params = {"prompt": input_data}
        
        # 提取参数
        prompt = params.get("prompt", "请输入您的回复:")
        timeout = int(params.get("timeout", os.getenv("DEFAULT_TIMEOUT", 1200)))
        placeholder = params.get("placeholder", "")
        title = params.get("title", "等待用户回复")
        
        # 解析选项
        options = parse_options(params)
        
        # 创建输入处理器
        handler = UserInputHandler()
        
        # 显示对话框并获取用户输入
        user_input = handler.show_input_dialog(prompt, options, timeout, placeholder, title)
        
        # 返回结果
        result = {
            "status": "success",
            "result": user_input
        }
        
        print(json.dumps(result, ensure_ascii=False), file=sys.stdout)
        sys.exit(0)
        
    except Exception as e:
        # 错误处理
        error_result = {
            "status": "error",
            "error": f"WaitingForUrReply Plugin Error: {str(e)}"
        }
        print(json.dumps(error_result, ensure_ascii=False), file=sys.stdout)
        sys.exit(1)


if __name__ == "__main__":
    main()