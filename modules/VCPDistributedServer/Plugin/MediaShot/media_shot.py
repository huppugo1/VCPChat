#!/usr/bin/env python3
"""
MediaShot - 多媒体截取和编辑插件
支持视频片段截取、音频片段截取、图像区域截取和编辑
"""

import sys
import json
import os
import base64
import subprocess
import tempfile
from pathlib import Path
import logging
import time
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from PIL.Image import Resampling
import math

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def check_dependencies():
    """检查必要的依赖"""
    try:
        result = subprocess.run(['ffmpeg', '-version'], 
                              capture_output=True, text=True, timeout=5)
        if result.returncode != 0:
            return False, "FFmpeg未安装或不可用"
        return True, "FFmpeg可用"
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False, "FFmpeg未安装或不可用"

def format_time_ms(timestamp_ms):
    """将毫秒转换为FFmpeg时间格式"""
    seconds = timestamp_ms / 1000.0
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    remaining_seconds = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{remaining_seconds:06.3f}"

def get_media_duration(file_path):
    """获取媒体文件的时长（毫秒）"""
    try:
        cmd = [
            'ffprobe',
            '-v', 'quiet',
            '-show_entries', 'format=duration',
            '-of', 'csv=p=0',
            file_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            duration_seconds = float(result.stdout.strip())
            return int(duration_seconds * 1000)
        return None
    except Exception:
        return None

def capture_frame(video_path, timestamp_ms, output_path=None, quality=None, format_type=None):
    """从视频中捕获指定时间点的帧"""
    
    # 获取配置
    config_quality = int(os.getenv('OUTPUT_QUALITY', '100'))
    config_format = os.getenv('OUTPUT_FORMAT', 'jpg')
    
    # 使用参数或默认值
    quality = quality if quality is not None else config_quality
    format_type = format_type if format_type is not None else config_format
    
    # 验证参数
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"视频文件不存在: {video_path}")
    
    try:
        timestamp_ms = int(timestamp_ms)
    except (ValueError, TypeError):
        raise ValueError("时间戳必须是正整数（毫秒）")
    
    if timestamp_ms < 0:
        raise ValueError("时间戳必须是正整数（毫秒）")
    
    try:
        quality = int(quality)
    except (ValueError, TypeError):
        raise ValueError("图片质量必须是1-100之间的整数")
    
    if not 1 <= quality <= 100:
        raise ValueError("图片质量必须在1-100之间")
    
    if format_type not in ['jpg', 'png']:
        raise ValueError("输出格式必须是jpg或png")
    
    # 格式化时间
    time_str = format_time_ms(timestamp_ms)
    
    # 如果没有指定输出路径，自动保存到 /images 目录
    if output_path is None:
        video_filename = os.path.splitext(os.path.basename(video_path))[0]
        output_dir = os.path.join(os.getcwd(), "images")
        os.makedirs(output_dir, exist_ok=True)
        safe_filename = "".join(c for c in video_filename if c.isalnum() or c in (' ', '-', '_', '.')).rstrip()
        current_time = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = os.path.join(output_dir, f"{safe_filename}_{timestamp_ms}_{current_time}.{format_type}")
    
    # 确保输出目录存在
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)
    
    # 构建FFmpeg命令
    cmd = [
        'ffmpeg',
        '-ss', time_str,
        '-i', video_path,
        '-vframes', '1',
        '-q:v', '1',
        '-y',
        output_path
    ]
    
    # 执行命令
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg执行失败: {result.stderr}")
        
        if not os.path.exists(output_path):
            raise RuntimeError("截图文件生成失败")
        
        return output_path
        
    except subprocess.TimeoutExpired:
        raise RuntimeError("截图操作超时")
    except Exception as e:
        raise RuntimeError(f"截图过程中发生错误: {str(e)}")

def extract_video_clip(video_path, start_ms, end_ms, output_path=None, quality="medium"):
    """从视频中截取指定时间段的片段"""
    
    # 验证参数
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"视频文件不存在: {video_path}")
    
    try:
        start_ms = int(start_ms)
        end_ms = int(end_ms)
    except (ValueError, TypeError):
        raise ValueError("开始时间和结束时间必须是整数（毫秒）")
    
    if start_ms < 0:
        raise ValueError("开始时间必须是非负整数")
    
    if end_ms <= start_ms:
        raise ValueError("结束时间必须大于开始时间")
    
    # 获取视频时长并调整结束时间
    duration_ms = get_media_duration(video_path)
    if duration_ms and end_ms > duration_ms:
        end_ms = duration_ms
        logger.info(f"结束时间超过视频长度，自动调整为: {end_ms}ms")
    
    # 转换时间格式
    start_time = format_time_ms(start_ms)
    duration_ms_actual = end_ms - start_ms
    duration_time = format_time_ms(duration_ms_actual)
    
    # 如果没有指定输出路径，自动生成
    if output_path is None:
        video_filename = os.path.splitext(os.path.basename(video_path))[0]
        output_dir = os.path.join(os.getcwd(), "videos")
        os.makedirs(output_dir, exist_ok=True)
        safe_filename = "".join(c for c in video_filename if c.isalnum() or c in (' ', '-', '_', '.')).rstrip()
        current_time = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = os.path.join(output_dir, f"{safe_filename}_clip_{start_ms}_{end_ms}_{current_time}.mp4")
    
    # 确保输出目录存在
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)
    
    # 根据质量设置编码参数
    quality_settings = {
        "low": ["-crf", "30"],
        "medium": ["-crf", "23"],
        "high": ["-crf", "18"]
    }
    
    if quality not in quality_settings:
        quality = "medium"
    
    # 构建FFmpeg命令
    cmd = [
        'ffmpeg',
        '-ss', start_time,
        '-i', video_path,
        '-t', duration_time,
        '-c:v', 'libx264',
        '-c:a', 'aac'
    ] + quality_settings[quality] + [
        '-y',
        output_path
    ]
    
    # 执行命令
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg执行失败: {result.stderr}")
        
        if not os.path.exists(output_path):
            raise RuntimeError("视频片段生成失败")
        
        return output_path
        
    except subprocess.TimeoutExpired:
        raise RuntimeError("视频截取操作超时")
    except Exception as e:
        raise RuntimeError(f"视频截取过程中发生错误: {str(e)}")

def extract_audio_clip(audio_path, start_ms, end_ms, output_path=None, format_type="mp3"):
    """从音频或视频文件中截取指定时间段的音频片段"""
    
    # 验证参数
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"音频文件不存在: {audio_path}")
    
    try:
        start_ms = int(start_ms)
        end_ms = int(end_ms)
    except (ValueError, TypeError):
        raise ValueError("开始时间和结束时间必须是整数（毫秒）")
    
    if start_ms < 0:
        raise ValueError("开始时间必须是非负整数")
    
    if end_ms <= start_ms:
        raise ValueError("结束时间必须大于开始时间")
    
    if format_type not in ['mp3', 'wav', 'aac']:
        raise ValueError("输出格式必须是mp3、wav或aac")
    
    # 获取音频时长并调整结束时间
    duration_ms = get_media_duration(audio_path)
    if duration_ms and end_ms > duration_ms:
        end_ms = duration_ms
        logger.info(f"结束时间超过音频长度，自动调整为: {end_ms}ms")
    
    # 转换时间格式
    start_time = format_time_ms(start_ms)
    duration_ms_actual = end_ms - start_ms
    duration_time = format_time_ms(duration_ms_actual)
    
    # 如果没有指定输出路径，自动生成
    if output_path is None:
        audio_filename = os.path.splitext(os.path.basename(audio_path))[0]
        output_dir = os.path.join(os.getcwd(), "audios")
        os.makedirs(output_dir, exist_ok=True)
        safe_filename = "".join(c for c in audio_filename if c.isalnum() or c in (' ', '-', '_', '.')).rstrip()
        current_time = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = os.path.join(output_dir, f"{safe_filename}_clip_{start_ms}_{end_ms}_{current_time}.{format_type}")
    
    # 确保输出目录存在
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)
    
    # 构建FFmpeg命令
    cmd = [
        'ffmpeg',
        '-ss', start_time,
        '-i', audio_path,
        '-t', duration_time,
        '-vn',  # 不包含视频
        '-y',
        output_path
    ]
    
    # 执行命令
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg执行失败: {result.stderr}")
        
        if not os.path.exists(output_path):
            raise RuntimeError("音频片段生成失败")
        
        return output_path
        
    except subprocess.TimeoutExpired:
        raise RuntimeError("音频截取操作超时")
    except Exception as e:
        raise RuntimeError(f"音频截取过程中发生错误: {str(e)}")

def crop_image(image_path, x, y, width, height, output_path=None):
    """截取图片的指定区域（按比例参数）"""
    
    # 验证参数
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"图片文件不存在: {image_path}")
    
    try:
        x = float(x)
        y = float(y) 
        width = float(width)
        height = float(height)
    except (ValueError, TypeError):
        raise ValueError("坐标和尺寸参数必须是数字")
    
    if not (0 <= x <= 1) or not (0 <= y <= 1):
        raise ValueError("坐标比例必须在0-1之间")
    
    if not (0 < width <= 1) or not (0 < height <= 1):
        raise ValueError("尺寸比例必须在0-1之间")
    
    if x + width > 1 or y + height > 1:
        raise ValueError("截取区域超出图片边界")
    
    # 如果没有指定输出路径，自动生成
    if output_path is None:
        image_filename = os.path.splitext(os.path.basename(image_path))[0]
        image_ext = os.path.splitext(image_path)[1]
        output_dir = os.path.join(os.getcwd(), "images")
        os.makedirs(output_dir, exist_ok=True)
        safe_filename = "".join(c for c in image_filename if c.isalnum() or c in (' ', '-', '_', '.')).rstrip()
        current_time = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = os.path.join(output_dir, f"{safe_filename}_crop_{current_time}{image_ext}")
    
    # 确保输出目录存在
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)
    
    try:
        # 打开图片
        with Image.open(image_path) as img:
            img_width, img_height = img.size
            
            # 计算实际像素坐标
            left = int(x * img_width)
            top = int(y * img_height)
            right = int((x + width) * img_width)
            bottom = int((y + height) * img_height)
            
            # 截取图片
            cropped_img = img.crop((left, top, right, bottom))
            
            # 保存图片
            cropped_img.save(output_path, quality=95)
            
        return output_path
        
    except Exception as e:
        raise RuntimeError(f"图片截取过程中发生错误: {str(e)}")

def get_color_rgb(color_input):
    """将颜色名称或16进制数值转换为RGB值"""
    if isinstance(color_input, str):
        # 处理16进制颜色值
        if color_input.startswith('#'):
            try:
                hex_color = color_input[1:]
                if len(hex_color) == 6:
                    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
                elif len(hex_color) == 3:
                    return tuple(int(hex_color[i]*2, 16) for i in range(3))
                else:
                    raise ValueError("无效的16进制颜色格式")
            except ValueError:
                pass  # 如果转换失败，继续尝试颜色名称
        
        # 处理颜色名称
        color_map = {
            'red': (255, 0, 0),
            'green': (0, 255, 0),
            'blue': (0, 0, 255),
            'yellow': (255, 255, 0),
            'orange': (255, 165, 0),
            'purple': (128, 0, 128),
            'pink': (255, 192, 203),
            'black': (0, 0, 0),
            'white': (255, 255, 255),
            'gray': (128, 128, 128),
            'grey': (128, 128, 128),
            'cyan': (0, 255, 255),
            'magenta': (255, 0, 255),
            'brown': (165, 42, 42),
            'navy': (0, 0, 128),
            'lime': (0, 255, 0),
            'maroon': (128, 0, 0),
            'olive': (128, 128, 0),
            'silver': (192, 192, 192),
            'gold': (255, 215, 0)
        }
        return color_map.get(color_input.lower(), (255, 0, 0))  # 默认红色
    
    return (255, 0, 0)  # 默认红色

def get_system_font(font_size):
    """获取系统可用字体，支持多语言文字渲染"""
    # 系统字体搜索路径（按优先级排序）
    font_paths = [
        # macOS 系统字体
        "/System/Library/Fonts/Hiragino Sans GB.ttc",  # 优先使用稳定的中文字体
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/Arial Unicode MS.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        # Linux 系统字体
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",  # 优先使用CJK字体
        "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
        "/usr/share/fonts/truetype/arphic/ukai.ttc",
        "/usr/share/fonts/truetype/arphic/uming.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        # Windows 系统字体
        "C:/Windows/Fonts/msyh.ttc",  # 优先使用微软雅黑
        "C:/Windows/Fonts/simsun.ttc",
        "C:/Windows/Fonts/simhei.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/tahoma.ttf",
        # 日文字体
        "/System/Library/Fonts/Hiragino Kaku Gothic ProN.ttc",  # macOS
        "C:/Windows/Fonts/msgothic.ttc",  # Windows
        "/usr/share/fonts/truetype/takao-gothic/TakaoGothic.ttf",  # Linux
        # 韩文字体
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",  # macOS
        "C:/Windows/Fonts/malgun.ttf",  # Windows
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"  # Linux
    ]
    
    # 系统字体加载逻辑
    for font_path in font_paths:
        if os.path.exists(font_path):
            try:
                # 直接加载字体
                return ImageFont.truetype(font_path, font_size)
            except (OSError, IOError, ValueError) as e:
                # 记录错误但继续尝试下一个字体
                logger.info(f"字体加载失败 {os.path.basename(font_path)}: {e}")
                continue
    
    # 如果都找不到，使用默认字体
    try:
        return ImageFont.load_default()
    except:
        logger.warning("无法加载任何字体，包括默认字体")
        return None

def draw_text(draw, position, text, fill, font):
    """统一的文本绘制函数"""
    try:
        # 统一的文本渲染方式
        draw.text(position, text, fill=fill, font=font)
        return True
    except Exception as e:
        logger.warning(f"文本渲染失败: {e}")
        return False

def calculate_smart_stroke_width(image_width, image_height, stroke_ratio=0.002):
    """根据图片分辨率智能计算线条粗细"""
    # 使用图片对角线长度来计算合适的线条粗细
    diagonal = math.sqrt(image_width ** 2 + image_height ** 2)
    stroke_width = max(1, int(diagonal * stroke_ratio))
    return stroke_width

def calculate_smart_font_size(image_width, image_height, font_ratio=0.03):
    """根据图片分辨率智能计算字体大小"""
    # 使用图片较小边的长度来计算合适的字体大小
    min_dimension = min(image_width, image_height)
    font_size = max(12, int(min_dimension * font_ratio))
    return font_size

def draw_arrow(draw, start_x, start_y, end_x, end_y, color_rgb, arrow_width, arrow_head_size=None):
    """绘制箭头"""
    if arrow_head_size is None:
        arrow_head_size = arrow_width * 3
    
    # 绘制箭头主体线条
    draw.line([(start_x, start_y), (end_x, end_y)], fill=color_rgb, width=arrow_width)
    
    # 计算箭头角度
    import math
    angle = math.atan2(end_y - start_y, end_x - start_x)
    
    # 计算箭头头部的三个点
    arrow_angle = math.pi / 6  # 30度角
    head_length = arrow_head_size
    
    # 左侧箭头线
    left_x = end_x - head_length * math.cos(angle - arrow_angle)
    left_y = end_y - head_length * math.sin(angle - arrow_angle)
    draw.line([(end_x, end_y), (left_x, left_y)], fill=color_rgb, width=arrow_width)
    
    # 右侧箭头线
    right_x = end_x - head_length * math.cos(angle + arrow_angle)
    right_y = end_y - head_length * math.sin(angle + arrow_angle)
    draw.line([(end_x, end_y), (right_x, right_y)], fill=color_rgb, width=arrow_width)

def apply_resolution_reduction(img, scale_ratio):
    """应用分辨率下降特效"""
    if not (0.1 <= scale_ratio <= 1.0):
        raise ValueError("分辨率比例必须在0.1-1.0之间")
    
    original_size = img.size
    new_width = int(original_size[0] * scale_ratio)
    new_height = int(original_size[1] * scale_ratio)
    
    # 先缩小再放大回原尺寸，产生分辨率下降效果
    small_img = img.resize((new_width, new_height), Resampling.LANCZOS)
    return small_img.resize(original_size, Resampling.NEAREST)

def apply_grayscale_effect(img):
    """应用黑白特效"""
    return img.convert('L').convert('RGB')

def crop_image_region(img, x, y, width, height):
    """截取图片指定区域（按比例）"""
    img_width, img_height = img.size
    
    # 计算实际像素坐标
    left = int(x * img_width)
    top = int(y * img_height)
    right = int((x + width) * img_width)
    bottom = int((y + height) * img_height)
    
    # 确保坐标在有效范围内
    left = max(0, min(left, img_width))
    top = max(0, min(top, img_height))
    right = max(left, min(right, img_width))
    bottom = max(top, min(bottom, img_height))
    
    return img.crop((left, top, right, bottom))

def generate_output_path(input_path, operation_suffix, output_dir="images"):
    """生成严格遵守命名规则的输出路径：原图片名字 + 唯一时间戳"""
    image_filename = os.path.splitext(os.path.basename(input_path))[0]
    image_ext = os.path.splitext(input_path)[1]
    
    # 创建输出目录
    full_output_dir = os.path.join(os.getcwd(), output_dir)
    os.makedirs(full_output_dir, exist_ok=True)
    
    # 清理文件名，只保留安全字符
    safe_filename = "".join(c for c in image_filename if c.isalnum() or c in (' ', '-', '_', '.')).rstrip()
    
    # 生成唯一时间戳（包含毫秒）
    current_time = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]  # 去掉最后3位微秒，保留毫秒
    
    # 构建最终路径
    final_filename = f"{safe_filename}_{operation_suffix}_{current_time}{image_ext}"
    return os.path.join(full_output_dir, final_filename)

def edit_image(image_path, edit_type, x=None, y=None, width=None, height=None, radius=None, 
               text=None, color="red", font_size_ratio=None, stroke_width_ratio=None, 
               text_position="center", arrow_end_x=None, arrow_end_y=None, 
               scale_ratio=None, output_path=None):
    """在图片指定区域绘制框、圆、箭头或添加文字注释，以及应用特效（按比例参数）"""
    
    # 验证参数
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"图片文件不存在: {image_path}")
    
    if edit_type not in ['rectangle', 'circle', 'text', 'arrow', 'resolution_reduction', 'grayscale', 'crop_region']:
        raise ValueError("编辑类型必须是rectangle、circle、text、arrow、resolution_reduction、grayscale或crop_region")
    
    # 验证坐标参数（对于需要坐标的编辑类型）
    if edit_type in ['rectangle', 'circle', 'text', 'arrow', 'crop_region']:
        if x is None or y is None:
            raise ValueError(f"{edit_type}需要x和y参数")
        try:
            x = float(x)
            y = float(y)
        except (ValueError, TypeError):
            raise ValueError("坐标参数必须是数字")
        
        if not (0 <= x <= 1) or not (0 <= y <= 1):
            raise ValueError("坐标比例必须在0-1之间")
    
    # 获取配置
    default_font_size = int(os.getenv('DEFAULT_FONT_SIZE', '20'))
    default_stroke_width = int(os.getenv('DEFAULT_STROKE_WIDTH', '2'))
    
    # 验证特定类型的参数
    if edit_type == 'rectangle':
        if width is None or height is None:
            raise ValueError("绘制矩形需要width和height参数")
        try:
            width = float(width)
            height = float(height)
        except (ValueError, TypeError):
            raise ValueError("尺寸参数必须是数字")
        if not (0 < width <= 1) or not (0 < height <= 1):
            raise ValueError("尺寸比例必须在0-1之间")
        if x + width > 1 or y + height > 1:
            raise ValueError("绘制区域超出图片边界")
    
    elif edit_type == 'circle':
        if radius is None:
            raise ValueError("绘制圆形需要radius参数")
        try:
            radius = float(radius)
        except (ValueError, TypeError):
            raise ValueError("半径参数必须是数字")
        if not (0 < radius <= 1):
            raise ValueError("半径比例必须在0-1之间")
    
    elif edit_type == 'text':
        if text is None:
            raise ValueError("添加文字需要text参数")
    
    elif edit_type == 'arrow':
        if arrow_end_x is None or arrow_end_y is None:
            raise ValueError("绘制箭头需要arrow_end_x和arrow_end_y参数")
        try:
            arrow_end_x = float(arrow_end_x)
            arrow_end_y = float(arrow_end_y)
        except (ValueError, TypeError):
            raise ValueError("箭头终点坐标参数必须是数字")
        if not (0 <= arrow_end_x <= 1) or not (0 <= arrow_end_y <= 1):
            raise ValueError("箭头终点坐标比例必须在0-1之间")
    
    elif edit_type == 'resolution_reduction':
        if scale_ratio is None:
            raise ValueError("分辨率下降需要scale_ratio参数")
        try:
            scale_ratio = float(scale_ratio)
        except (ValueError, TypeError):
            raise ValueError("scale_ratio参数必须是数字")
        if not (0.1 <= scale_ratio <= 1.0):
            raise ValueError("分辨率比例必须在0.1-1.0之间")
    
    elif edit_type == 'crop_region':
        if width is None or height is None:
            raise ValueError("区域截取需要width和height参数")
        try:
            width = float(width)
            height = float(height)
        except (ValueError, TypeError):
            raise ValueError("尺寸参数必须是数字")
        if not (0 < width <= 1) or not (0 < height <= 1):
            raise ValueError("尺寸比例必须在0-1之间")
        if x + width > 1 or y + height > 1:
            raise ValueError("截取区域超出图片边界")
    
    # 如果没有指定输出路径，自动生成（使用严格命名规则）
    if output_path is None:
        operation_suffix = edit_type
        if edit_type == 'resolution_reduction':
            operation_suffix = f"resolution_{int(scale_ratio*100)}pct"
        output_path = generate_output_path(image_path, operation_suffix)
    
    # 确保输出目录存在
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)
    
    try:
        # 打开图片
        with Image.open(image_path) as img:
            img_width, img_height = img.size
            
            # 先应用特效类编辑（分辨率下降、黑白、区域截取）
            if edit_type == 'resolution_reduction':
                edit_img = apply_resolution_reduction(img, scale_ratio)
            elif edit_type == 'grayscale':
                edit_img = apply_grayscale_effect(img)
            elif edit_type == 'crop_region':
                edit_img = crop_image_region(img, x, y, width, height)
            else:
                # 对于绘制类编辑，创建可编辑的副本
                edit_img = img.copy()
                draw = ImageDraw.Draw(edit_img)
                
                # 获取颜色
                color_rgb = get_color_rgb(color)
                
                # 根据比例值计算实际大小（如果未指定）
                if stroke_width_ratio is None:
                    if edit_type == 'text':
                        stroke_width = default_stroke_width
                    else:
                        stroke_width = calculate_smart_stroke_width(img_width, img_height)
                else:
                    # 根据比例和图片对角线长度计算线条粗细
                    diagonal = math.sqrt(img_width ** 2 + img_height ** 2)
                    stroke_width = max(1, int(diagonal * stroke_width_ratio))
                
                if font_size_ratio is None:
                    if edit_type == 'text':
                        font_size = calculate_smart_font_size(img_width, img_height)
                    else:
                        font_size = default_font_size
                else:
                    # 根据比例和图片较小边计算字体大小
                    min_dimension = min(img_width, img_height)
                    font_size = max(12, int(min_dimension * font_size_ratio))
                
                if edit_type == 'rectangle':
                    # 计算实际像素坐标
                    left = int(x * img_width)
                    top = int(y * img_height)
                    right = int((x + width) * img_width)
                    bottom = int((y + height) * img_height)
                    
                    # 绘制矩形
                    draw.rectangle([left, top, right, bottom], outline=color_rgb, width=stroke_width)
                
                elif edit_type == 'circle':
                    # 计算实际像素坐标
                    center_x = int(x * img_width)
                    center_y = int(y * img_height)
                    radius_px = int(radius * min(img_width, img_height))
                    
                    # 绘制圆形
                    left = center_x - radius_px
                    top = center_y - radius_px
                    right = center_x + radius_px
                    bottom = center_y + radius_px
                    draw.ellipse([left, top, right, bottom], outline=color_rgb, width=stroke_width)
                
                elif edit_type == 'text':
                    # 计算实际像素坐标
                    pos_x = int(x * img_width)
                    pos_y = int(y * img_height)
                    
                    # 获取支持多语言的字体
                    font = get_system_font(font_size)  # 使用系统字体
                    if font is None:
                        font = ImageFont.load_default()
                    
                    # 根据text_position调整文字位置
                    if text_position != "center":
                        try:
                            # 获取文字边界框来计算偏移
                            bbox = draw.textbbox((0, 0), text, font=font)
                            text_width = bbox[2] - bbox[0]
                            text_height = bbox[3] - bbox[1]
                            
                            if text_position == "top_left":
                                pass  # 不需要调整
                            elif text_position == "top_center":
                                pos_x -= text_width // 2
                            elif text_position == "top_right":
                                pos_x -= text_width
                            elif text_position == "center_left":
                                pos_y -= text_height // 2
                            elif text_position == "center":
                                pos_x -= text_width // 2
                                pos_y -= text_height // 2
                            elif text_position == "center_right":
                                pos_x -= text_width
                                pos_y -= text_height // 2
                            elif text_position == "bottom_left":
                                pos_y -= text_height
                            elif text_position == "bottom_center":
                                pos_x -= text_width // 2
                                pos_y -= text_height
                            elif text_position == "bottom_right":
                                pos_x -= text_width
                                pos_y -= text_height
                        except:
                            pass  # 如果计算失败，使用原始位置
                    
                    # 添加文字
                    draw_text(draw, (pos_x, pos_y), text, color_rgb, font)
                
                elif edit_type == 'arrow':
                    # 计算实际像素坐标
                    start_x = int(x * img_width)
                    start_y = int(y * img_height)
                    end_x = int(arrow_end_x * img_width)
                    end_y = int(arrow_end_y * img_height)
                    
                    # 绘制箭头
                    draw_arrow(draw, start_x, start_y, end_x, end_y, color_rgb, stroke_width)
            
            # 保存图片
            edit_img.save(output_path, quality=95)
            
        return output_path
        
    except Exception as e:
        raise RuntimeError(f"图片编辑过程中发生错误: {str(e)}")

def encode_image_to_base64(image_path):
    """将图片文件编码为base64"""
    try:
        with open(image_path, 'rb') as image_file:
            image_data = image_file.read()
            base64_data = base64.b64encode(image_data).decode('utf-8')
            
            ext = Path(image_path).suffix.lower()
            mime_type = 'image/jpeg' if ext == '.jpg' else 'image/png'
            
            return f"data:{mime_type};base64,{base64_data}"
    except Exception as e:
        raise RuntimeError(f"图片编码失败: {str(e)}")

def batch_edit_image(image_path, edits, output_path=None):
    """批量编辑图片：逐步应用多个编辑操作（特效类操作会改变图片，绘制类操作会添加元素）"""
    
    # 验证参数
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"图片文件不存在: {image_path}")
    
    if not isinstance(edits, list) or len(edits) == 0:
        raise ValueError("编辑列表必须是非空数组")
    
    # 如果没有指定输出路径，自动生成（使用严格命名规则）
    if output_path is None:
        output_path = generate_output_path(image_path, "batch_edit")
    
    # 确保输出目录存在
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)
    
    try:
        # 打开原始图片
        current_image_path = image_path
        temp_files = []  # 用于跟踪临时文件
        
        # 逐步应用每个编辑操作
        for i, edit in enumerate(edits):
            try:
                # 验证必要参数
                if 'editType' not in edit:
                    raise ValueError(f"编辑操作{i+1}缺少必要参数: editType")
                
                edit_type = edit['editType']
                
                # 对于特效类操作，验证坐标参数（除了黑白特效）
                if edit_type in ['rectangle', 'circle', 'text', 'arrow', 'crop_region']:
                    if 'x' not in edit or 'y' not in edit:
                        raise ValueError(f"编辑操作{i+1}缺少必要参数: x, y")
                
                # 为中间步骤生成临时输出路径
                if i == len(edits) - 1:
                    # 最后一步使用最终输出路径
                    step_output_path = output_path
                else:
                    # 中间步骤使用临时文件
                    temp_suffix = f"temp_step_{i+1}_{edit_type}"
                    step_output_path = generate_output_path(current_image_path, temp_suffix)
                    temp_files.append(step_output_path)
                
                # 调用edit_image函数应用单个编辑
                current_image_path = edit_image(
                    image_path=current_image_path,
                    edit_type=edit_type,
                    x=edit.get('x'),
                    y=edit.get('y'),
                    width=edit.get('width'),
                    height=edit.get('height'),
                    radius=edit.get('radius'),
                    text=edit.get('text'),
                    color=edit.get('color', 'red'),
                    font_size_ratio=edit.get('fontSize'),
                    stroke_width_ratio=edit.get('strokeWidth'),
                    text_position=edit.get('textPosition', 'center'),
                    arrow_end_x=edit.get('arrowEndX'),
                    arrow_end_y=edit.get('arrowEndY'),
                    scale_ratio=edit.get('scaleRatio'),
                    output_path=step_output_path
                )
                
            except Exception as e:
                # 清理临时文件
                for temp_file in temp_files:
                    try:
                        if os.path.exists(temp_file):
                            os.remove(temp_file)
                    except:
                        pass
                raise RuntimeError(f"处理编辑操作{i+1}时发生错误: {str(e)}")
        
        # 清理中间临时文件（保留最终结果）
        for temp_file in temp_files:
            try:
                if os.path.exists(temp_file) and temp_file != output_path:
                    os.remove(temp_file)
            except:
                pass
        
        return output_path
        
    except Exception as e:
        raise RuntimeError(f"批量编辑过程中发生错误: {str(e)}")

def combined_capture(video_path, timestamp_ms, edit_type, x=None, y=None, width=None, height=None, 
                    radius=None, text=None, color="red", font_size_ratio=None, stroke_width_ratio=None,
                    text_position="center", arrow_end_x=None, arrow_end_y=None, 
                    scale_ratio=None, output_path=None):
    """组合功能：先从视频截图，然后立即对截图进行编辑"""
    
    try:
        # 第一步：从视频截图
        screenshot_path = capture_frame(video_path, timestamp_ms)
        
        # 第二步：对截图进行编辑
        edited_path = edit_image(
            image_path=screenshot_path,
            edit_type=edit_type,
            x=x, y=y,
            width=width,
            height=height,
            radius=radius,
            text=text,
            color=color,
            font_size_ratio=font_size_ratio,
            stroke_width_ratio=stroke_width_ratio,
            text_position=text_position,
            arrow_end_x=arrow_end_x,
            arrow_end_y=arrow_end_y,
            scale_ratio=scale_ratio,
            output_path=output_path
        )
        
        # 删除临时截图文件（如果不是最终输出）
        if edited_path != screenshot_path:
            try:
                os.remove(screenshot_path)
            except:
                pass
        
        return edited_path
        
    except Exception as e:
        raise RuntimeError(f"组合操作过程中发生错误: {str(e)}")

def main():
    """主函数"""
    try:
        # 读取输入
        input_data = sys.stdin.readline().strip()
        if not input_data:
            raise ValueError("未收到输入数据")
        
        # 解析JSON
        try:
            params = json.loads(input_data)
        except json.JSONDecodeError:
            raise ValueError("输入数据格式无效")
        
        # 检查必要参数
        if 'command' not in params:
            raise ValueError("缺少必要参数: command")
        
        command = params['command']
        
        # 检查依赖
        deps_ok, deps_msg = check_dependencies()
        if not deps_ok:
            raise RuntimeError(f"依赖检查失败: {deps_msg}")
        
        result = None
        
        if command == 'CaptureFrame':
            # 视频截图
            if 'videoPath' not in params or 'timestampMs' not in params:
                raise ValueError("CaptureFrame需要videoPath和timestampMs参数")
            
            screenshot_path = capture_frame(
                video_path=params['videoPath'],
                timestamp_ms=params['timestampMs'],
                output_path=params.get('outputPath'),
                quality=params.get('quality'),
                format_type=params.get('format')
            )
            
            abs_path = os.path.abspath(screenshot_path)
            
            try:
                base64_image = encode_image_to_base64(screenshot_path)
                image_content = {
                    "type": "image_url",
                    "image_url": {"url": base64_image}
                }
            except Exception:
                image_content = None
            
            result = {
                "content": [
                    {
                        "type": "text",
                        "text": f"视频截图成功！\n- 视频文件: {params['videoPath']}\n- 时间点: {params['timestampMs']}ms\n- 输出路径: {abs_path}\n- 图片质量: 最高品质\n\n如无特殊指示，默认请在接下来的对话中直接用图片地址将此图渲染在聊天气泡中的合适位置"
                    }
                ]
            }
            
            if image_content:
                result["content"].append(image_content)
            
            result["image_path"] = abs_path
            result["relative_path"] = screenshot_path
        
        elif command == 'ExtractVideoClip':
            # 视频片段截取
            required_params = ['videoPath', 'startMs', 'endMs']
            for param in required_params:
                if param not in params:
                    raise ValueError(f"ExtractVideoClip需要{param}参数")
            
            # 处理数值参数的类型转换
            start_ms = int(params['startMs'])
            end_ms = int(params['endMs'])
            
            clip_path = extract_video_clip(
                video_path=params['videoPath'],
                start_ms=start_ms,
                end_ms=end_ms,
                output_path=params.get('outputPath'),
                quality=params.get('quality', 'medium')
            )
            
            abs_path = os.path.abspath(clip_path)
            duration = end_ms - start_ms
            
            result = {
                "content": [
                    {
                        "type": "text", 
                        "text": f"视频片段截取成功！\n- 原视频文件: {params['videoPath']}\n- 开始时间: {start_ms}ms\n- 结束时间: {end_ms}ms\n- 片段时长: {duration}ms\n- 输出路径: {abs_path}\n- 质量: {params.get('quality', 'medium')}"
                    }
                ]
            }
            
            result["video_path"] = abs_path
            result["relative_path"] = clip_path
        
        elif command == 'ExtractAudioClip':
            # 音频片段截取
            required_params = ['audioPath', 'startMs', 'endMs']
            for param in required_params:
                if param not in params:
                    raise ValueError(f"ExtractAudioClip需要{param}参数")
            
            # 处理数值参数的类型转换
            start_ms = int(params['startMs'])
            end_ms = int(params['endMs'])
            
            clip_path = extract_audio_clip(
                audio_path=params['audioPath'],
                start_ms=start_ms,
                end_ms=end_ms,
                output_path=params.get('outputPath'),
                format_type=params.get('format', 'mp3')
            )
            
            abs_path = os.path.abspath(clip_path)
            duration = end_ms - start_ms
            
            result = {
                "content": [
                    {
                        "type": "text",
                        "text": f"音频片段截取成功！\n- 原音频文件: {params['audioPath']}\n- 开始时间: {start_ms}ms\n- 结束时间: {end_ms}ms\n- 片段时长: {duration}ms\n- 输出路径: {abs_path}\n- 格式: {params.get('format', 'mp3')}"
                    }
                ]
            }
            
            result["audio_path"] = abs_path
            result["relative_path"] = clip_path
        
        elif command == 'CropImage':
            # 图像区域截取
            required_params = ['imagePath', 'x', 'y', 'width', 'height']
            for param in required_params:
                if param not in params:
                    raise ValueError(f"CropImage需要{param}参数")
            
            cropped_path = crop_image(
                image_path=params['imagePath'],
                x=float(params['x']),
                y=float(params['y']),
                width=float(params['width']),
                height=float(params['height']),
                output_path=params.get('outputPath')
            )
            
            abs_path = os.path.abspath(cropped_path)
            
            try:
                base64_image = encode_image_to_base64(cropped_path)
                image_content = {
                    "type": "image_url",
                    "image_url": {"url": base64_image}
                }
            except Exception:
                image_content = None
            
            result = {
                "content": [
                    {
                        "type": "text",
                        "text": f"图像区域截取成功！\n- 原图片文件: {params['imagePath']}\n- 截取区域: ({params['x']}, {params['y']}) - ({params['x']+params['width']}, {params['y']+params['height']})\n- 输出路径: {abs_path}"
                    }
                ]
            }
            
            if image_content:
                result["content"].append(image_content)
            
            result["image_path"] = abs_path
            result["relative_path"] = cropped_path
        
        elif command == 'EditImage':
            # 图像编辑
            required_params = ['imagePath', 'editType']
            for param in required_params:
                if param not in params:
                    raise ValueError(f"EditImage需要{param}参数")
            
            # 处理数值参数的类型转换
            font_size_ratio = params.get('fontSize')
            if font_size_ratio is not None:
                font_size_ratio = float(font_size_ratio)
            
            stroke_width_ratio = params.get('strokeWidth')
            if stroke_width_ratio is not None:
                stroke_width_ratio = float(stroke_width_ratio)
            
            # 处理坐标参数（对于需要坐标的编辑类型）
            x = params.get('x')
            if x is not None:
                x = float(x)
                
            y = params.get('y')
            if y is not None:
                y = float(y)
            
            width = params.get('width')
            if width is not None:
                width = float(width)
                
            height = params.get('height')
            if height is not None:
                height = float(height)
                
            radius = params.get('radius')
            if radius is not None:
                radius = float(radius)
                
            arrow_end_x = params.get('arrowEndX')
            if arrow_end_x is not None:
                arrow_end_x = float(arrow_end_x)
                
            arrow_end_y = params.get('arrowEndY')
            if arrow_end_y is not None:
                arrow_end_y = float(arrow_end_y)
            
            scale_ratio = params.get('scaleRatio')
            if scale_ratio is not None:
                scale_ratio = float(scale_ratio)
            
            edited_path = edit_image(
                image_path=params['imagePath'],
                edit_type=params['editType'],
                x=x,
                y=y,
                width=width,
                height=height,
                radius=radius,
                text=params.get('text'),
                color=params.get('color', 'red'),
                font_size_ratio=font_size_ratio,
                stroke_width_ratio=stroke_width_ratio,
                text_position=params.get('textPosition', 'center'),
                arrow_end_x=arrow_end_x,
                arrow_end_y=arrow_end_y,
                scale_ratio=scale_ratio,
                output_path=params.get('outputPath')
            )
            
            abs_path = os.path.abspath(edited_path)
            
            try:
                base64_image = encode_image_to_base64(edited_path)
                image_content = {
                    "type": "image_url",
                    "image_url": {"url": base64_image}
                }
            except Exception:
                image_content = None
            
            edit_desc = f"编辑类型: {params['editType']}"
            if params['editType'] == 'text' and params.get('text'):
                edit_desc += f", 文字: {params['text']}"
            elif params['editType'] == 'resolution_reduction' and params.get('scaleRatio'):
                edit_desc += f", 分辨率比例: {params['scaleRatio']}"
            if params.get('color'):
                edit_desc += f", 颜色: {params.get('color', 'red')}"
            
            # 构建位置信息
            position_info = ""
            if x is not None and y is not None:
                position_info = f"编辑位置: ({x}, {y})"
            
            result = {
                "content": [
                    {
                        "type": "text",
                        "text": f"图像编辑成功！\n- 原图片文件: {params['imagePath']}\n- {edit_desc}\n- {position_info}\n- 输出路径: {abs_path}"
                    }
                ]
            }
            
            if image_content:
                result["content"].append(image_content)
            
            result["image_path"] = abs_path
            result["relative_path"] = edited_path
        
        elif command == 'BatchEditImage':
            # 批量图像编辑
            required_params = ['imagePath', 'edits']
            for param in required_params:
                if param not in params:
                    raise ValueError(f"BatchEditImage需要{param}参数")
            
            # 解析edits参数
            edits = params['edits']
            if isinstance(edits, str):
                try:
                    edits = json.loads(edits)
                except json.JSONDecodeError:
                    raise ValueError("edits参数必须是有效的JSON数组")
            
            if not isinstance(edits, list) or len(edits) == 0:
                raise ValueError("编辑列表必须是非空数组")
            
            edited_path = batch_edit_image(
                image_path=params['imagePath'],
                edits=edits,
                output_path=params.get('outputPath')
            )
            
            abs_path = os.path.abspath(edited_path)
            
            try:
                base64_image = encode_image_to_base64(edited_path)
                image_content = {
                    "type": "image_url",
                    "image_url": {"url": base64_image}
                }
            except Exception:
                image_content = None
            
            edit_count = len(params['edits'])
            
            result = {
                "content": [
                    {
                        "type": "text",
                        "text": f"批量图像编辑成功！\n- 原图片文件: {params['imagePath']}\n- 编辑操作数量: {edit_count}\n- 输出路径: {abs_path}"
                    }
                ]
            }
            
            if image_content:
                result["content"].append(image_content)
            
            result["image_path"] = abs_path
            result["relative_path"] = edited_path
        
        elif command == 'CombinedCapture':
            # 组合功能：视频截图+图像编辑
            required_params = ['videoPath', 'timestampMs', 'editType']
            for param in required_params:
                if param not in params:
                    raise ValueError(f"CombinedCapture需要{param}参数")
            
            # 处理数值参数的类型转换
            font_size_ratio = params.get('fontSize')
            if font_size_ratio is not None:
                font_size_ratio = float(font_size_ratio)
            
            stroke_width_ratio = params.get('strokeWidth')
            if stroke_width_ratio is not None:
                stroke_width_ratio = float(stroke_width_ratio)
            
            # 处理坐标参数
            x = params.get('x')
            if x is not None:
                x = float(x)
                
            y = params.get('y')
            if y is not None:
                y = float(y)
            
            width = params.get('width')
            if width is not None:
                width = float(width)
                
            height = params.get('height')
            if height is not None:
                height = float(height)
                
            radius = params.get('radius')
            if radius is not None:
                radius = float(radius)
                
            arrow_end_x = params.get('arrowEndX')
            if arrow_end_x is not None:
                arrow_end_x = float(arrow_end_x)
                
            arrow_end_y = params.get('arrowEndY')
            if arrow_end_y is not None:
                arrow_end_y = float(arrow_end_y)
            
            scale_ratio = params.get('scaleRatio')
            if scale_ratio is not None:
                scale_ratio = float(scale_ratio)
            
            combined_path = combined_capture(
                video_path=params['videoPath'],
                timestamp_ms=int(params['timestampMs']),
                edit_type=params['editType'],
                x=x,
                y=y,
                width=width,
                height=height,
                radius=radius,
                text=params.get('text'),
                color=params.get('color', 'red'),
                font_size_ratio=font_size_ratio,
                stroke_width_ratio=stroke_width_ratio,
                text_position=params.get('textPosition', 'center'),
                arrow_end_x=arrow_end_x,
                arrow_end_y=arrow_end_y,
                scale_ratio=scale_ratio,
                output_path=params.get('outputPath')
            )
            
            abs_path = os.path.abspath(combined_path)
            
            try:
                base64_image = encode_image_to_base64(combined_path)
                image_content = {
                    "type": "image_url",
                    "image_url": {"url": base64_image}
                }
            except Exception:
                image_content = None
            
            edit_desc = f"编辑类型: {params['editType']}"
            if params['editType'] == 'text' and params.get('text'):
                edit_desc += f", 文字: {params['text']}"
            edit_desc += f", 颜色: {params.get('color', 'red')}"
            
            result = {
                "content": [
                    {
                        "type": "text",
                        "text": f"组合操作成功！\n- 视频文件: {params['videoPath']}\n- 截图时间: {params['timestampMs']}ms\n- {edit_desc}\n- 编辑位置: ({params['x']}, {params['y']})\n- 输出路径: {abs_path}"
                    }
                ]
            }
            
            if image_content:
                result["content"].append(image_content)
            
            result["image_path"] = abs_path
            result["relative_path"] = combined_path
        
        else:
            raise ValueError(f"不支持的命令: {command}")
        
        # 输出结果
        print(json.dumps({
            "status": "success",
            "result": result
        }, ensure_ascii=False))
        
    except Exception as e:
        # 输出错误
        print(json.dumps({
            "status": "error",
            "error": str(e)
        }, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    main()