import requests
import json

# sovits API的地址
base_url = "http://127.0.0.1:8000"

# 获取模型列表的端点和请求体
endpoint = "/models"
payload = {"version": "v4"}

try:
    print(f"正在从 {base_url}{endpoint} 获取模型列表...")
    
    response = requests.post(f"{base_url}{endpoint}", json=payload)
    response.raise_for_status() # 确保请求成功

    # requests 库会自动处理编码，解决乱码问题
    data = response.json()

    if data.get("msg") == "获取成功" and "models" in data:
        models = data["models"]
        print("\n--- 可用的模型列表 ---")
        if not models:
            print("未找到任何模型。")
        else:
            for model_name, details in models.items():
                print(f"- {model_name}")
                # 也可以打印更详细的信息
                # for lang, emotions in details.items():
                #     print(f"  - 语言: {lang}, 支持的情感: {', '.join(emotions)}")
        print("\n----------------------")
    else:
        print("\n获取模型列表失败，API返回内容：")
        print(data)

except requests.exceptions.RequestException as e:
    print(f"\n请求失败: {e}")
except json.JSONDecodeError:
    print("\n无法解析返回的JSON，原始响应内容如下：")
    print(response.text)