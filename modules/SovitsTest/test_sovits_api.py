import requests
import json

# sovits API的地址
base_url = "http://127.0.0.1:8000"

# ==============================================================================
# 最终成功方案！感谢您从源代码中获取的权威 payload 结构。
# ==============================================================================

# --- 根据逆向源码得到的参数 ---
text_to_speak = "功夫不负有心人，我们终于成功了！"
# model 字段是固定的引擎版本标识符
model_engine = "tts-v4" 
# voice 字段是角色模型名称
voice_name = "原神-中文-绮良良_ZH"

# --- 构建最终的、正确的请求体 ---
payload = {
  "model": model_engine,
  "input": text_to_speak,
  "voice": voice_name,
  "response_format": "wav",
  "speed": 1.0,
  "other_params": {
    "app_key": "",
    "text_lang": "中文",
    "prompt_lang": "中文",
    "emotion": "默认",
    "top_k": 10,
    "top_p": 1.0,
    "temperature": 1.0,
    "text_split_method": "按标点符号切",
    "batch_size": 1,
    "batch_threshold": 0.75,
    "split_bucket": True,
    "fragment_interval": 0.3,
    "parallel_infer": True,
    "repetition_penalty": 1.35,
    "sample_steps": 16,
    "if_sr": False,
    "seed": -1
  }
}

# --- API 调用逻辑 ---
try:
    print("="*50)
    print("正在向 /v1/audio/speech 发送最终请求...")
    print("请求体详情:")
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    print("="*50)
    
    response = requests.post(f"{base_url}/v1/audio/speech", json=payload)
    response.raise_for_status()

    if 'audio/wav' in response.headers.get('Content-Type', ''):
        with open("output.wav", "wb") as f:
            f.write(response.content)
        print("\n[成功] 音频文件已保存为 output.wav")
        print("我们成功了！现在您可以用这个脚本进行TTS了。")
    else:
        print("\n[失败] API没有返回音频文件，返回内容如下：")
        try:
            print(response.json())
        except json.JSONDecodeError:
            print(response.text)

except requests.exceptions.RequestException as e:
    print(f"\n[失败] 请求异常: {e}")