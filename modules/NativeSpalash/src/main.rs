#![windows_subsystem = "windows"]

use std::path::Path;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use winit::{
    event::{Event, WindowEvent, ElementState, MouseButton},
    event_loop::{ControlFlow, EventLoopBuilder},
    window::{WindowBuilder, WindowLevel, Icon},
    dpi::{PhysicalSize, PhysicalPosition},
};
use softbuffer::{Context, Surface};
use image::{ImageFormat, GenericImageView, imageops::FilterType};
use tiny_skia::{Pixmap, PixmapPaint, Transform, Rect, Paint, Color};
use bytemuck;
use fontdue::{Font, FontSettings};

const READY_SIGNAL_FILE: &str = ".vcp_ready";
const WINDOW_WIDTH: u32 = 500;
const WINDOW_HEIGHT: u32 = 130;
const ICON_SIZE: u32 = 96; // Resized icon dimension
const ANIMATION_DURATION_SECS: f32 = 2.8; // Pseudo-load duration (Speed increased by 2x)
const FONT_SIZE: f32 = 24.0;
const TEXT_TO_RENDER: &str = "VChat正在启动中！~";

// 缓动函数：ease_out_quad(t) = t * (2 - t)
fn ease_out_quad(t: f32) -> f32 {
    t * (2.0 - t)
}
 
fn main() {
    // --- 1. Setup Event Loop and Window ---
    let event_loop = EventLoopBuilder::<()>::with_user_event().build().unwrap();

    let primary_monitor = event_loop.primary_monitor().expect("Failed to get primary monitor");
    let monitor_size = primary_monitor.size();
    let window_pos = PhysicalPosition {
        x: (monitor_size.width - WINDOW_WIDTH) / 2,
        y: (monitor_size.height - WINDOW_HEIGHT) / 2,
    };

    let window = Arc::new({
        let icon_image = image::load_from_memory_with_format(include_bytes!("../../assets/icon.png"), ImageFormat::Png).unwrap();
        let (width, height) = icon_image.dimensions();
        let icon = Icon::from_rgba(icon_image.into_rgba8().into_raw(), width, height).unwrap();

        WindowBuilder::new()
            .with_title("VCP Chat Loading...")
            .with_inner_size(PhysicalSize::new(WINDOW_WIDTH, WINDOW_HEIGHT))
            .with_position(window_pos)
            .with_decorations(false)
            .with_transparent(true)
            .with_resizable(false)
            .with_window_level(WindowLevel::AlwaysOnTop)
            .with_window_icon(Some(icon))
            .build(&event_loop)
            .unwrap()
    });

    let mut surface = {
        let context = Context::new(window.as_ref()).unwrap();
        Surface::new(&context, window.as_ref()).unwrap()
    };

    // --- 2. Load and prepare the splash image ---
    let splash_image_bytes = include_bytes!("../../assets/icon.png");
    let img = image::load_from_memory(splash_image_bytes).expect("Failed to load splash image");
    let resized_img = img.resize_exact(ICON_SIZE, ICON_SIZE, FilterType::Lanczos3);
    let mut img_rgba = resized_img.to_rgba8();

    // Manually premultiply alpha for correct transparency rendering
    for pixel in img_rgba.pixels_mut() {
        let alpha = pixel[3] as f32 / 255.0;
        pixel[0] = (pixel[0] as f32 * alpha) as u8;
        pixel[1] = (pixel[1] as f32 * alpha) as u8;
        pixel[2] = (pixel[2] as f32 * alpha) as u8;
    }

    let mut icon_pixmap = Pixmap::new(resized_img.width(), resized_img.height()).unwrap();
    icon_pixmap.pixels_mut().copy_from_slice(bytemuck::cast_slice(img_rgba.as_raw()));

    // --- 3. Start the file watcher thread ---
    let event_loop_proxy = event_loop.create_proxy();
    thread::spawn(move || {
        while !Path::new(READY_SIGNAL_FILE).exists() {
            thread::sleep(Duration::from_millis(200));
        }
        let _ = event_loop_proxy.send_event(());
        });
    
        // --- 4. Load Font ---
        let font_bytes = include_bytes!("蒙纳简漫画体.ttf");
        let font = Font::from_bytes(font_bytes as &[u8], FontSettings::default()).expect("Failed to load font");
    
        // --- 5. Run the Event Loop ---
        let start_time = Instant::now();
    let window_clone = Arc::clone(&window);
    event_loop.run(move |event, elwt| {
        elwt.set_control_flow(ControlFlow::Poll); // Use Poll for continuous animation

        match event {
            Event::WindowEvent { window_id, event } if window_id == window_clone.id() => match event {
                WindowEvent::RedrawRequested => {
                    let size = window_clone.inner_size();
                    let width = size.width;
                    let height = size.height;

                    surface.resize(width.try_into().unwrap(), height.try_into().unwrap()).unwrap();
                    let mut buffer = surface.buffer_mut().unwrap();
                    
                    let mut canvas = Pixmap::new(width, height).unwrap();
                    
                    // Draw rounded background
                    let bg_rect = Rect::from_xywh(0.0, 0.0, width as f32, height as f32).unwrap();
                    let mut bg_paint = Paint::default();
                    bg_paint.set_color_rgba8(42, 42, 42, 230); // Semi-transparent dark background
                    canvas.fill_rect(bg_rect, &bg_paint, Transform::identity(), None);


                    // Draw icon
                    let icon_x = 20.0;
                    let icon_y = (height as f32 - ICON_SIZE as f32) / 2.0;
                    canvas.draw_pixmap(0, 0, icon_pixmap.as_ref(), &PixmapPaint::default(), Transform::from_translate(icon_x, icon_y), None);

                    // Draw animated text
                    let elapsed_secs = start_time.elapsed().as_secs_f32();
                    let mut text_x = icon_x + ICON_SIZE as f32 + 20.0;
                    let text_y = height as f32 / 2.0 - 10.0;

                    for (i, character) in TEXT_TO_RENDER.chars().enumerate() {
                        let y_offset = (elapsed_secs * 10.0 + i as f32).sin() * 2.0; // Jitter effect
                        let (metrics, bitmap) = font.rasterize(character, FONT_SIZE);
                        
                        if metrics.width > 0 && metrics.height > 0 {
                            let mut char_pixmap = Pixmap::new(metrics.width as u32, metrics.height as u32).unwrap();
                            let mut paint = Paint::default();
                            paint.set_color_rgba8(224, 224, 224, 255); // Light grey text
    
                            let pixels = char_pixmap.pixels_mut();
                            for (j, &alpha) in bitmap.iter().enumerate() {
                                let x = j % metrics.width;
                                let y = j / metrics.width;
                                let index = y * metrics.width + x;
                                if let Some(p) = pixels.get_mut(index) {
                                    *p = Color::from_rgba8(224, 224, 224, alpha).premultiply().to_color_u8();
                                }
                            }
                            
                            canvas.draw_pixmap(
                                (text_x + metrics.xmin as f32) as i32,
                                (text_y - metrics.height as f32 + metrics.ymin as f32 + y_offset) as i32,
                                char_pixmap.as_ref(),
                                &PixmapPaint::default(),
                                Transform::identity(),
                                None,
                            );
                        }
                        text_x += metrics.advance_width;
                    }

                    // Draw progress bar
                    let progress_x = icon_x + ICON_SIZE as f32 + 20.0;
                    let progress_width = width as f32 - progress_x - 20.0;
                    let progress_y = height as f32 / 2.0 + 10.0;
                    let progress_height = 4.0;

                    let bg_bar_rect = Rect::from_xywh(progress_x, progress_y, progress_width, progress_height).unwrap();
                    let mut bg_bar_paint = Paint::default();
                    bg_bar_paint.set_color_rgba8(79, 79, 79, 255);
                    canvas.fill_rect(bg_bar_rect, &bg_bar_paint, Transform::identity(), None);

                    let elapsed = start_time.elapsed().as_secs_f32();
                    let t = (elapsed / ANIMATION_DURATION_SECS).min(1.0);
                    let progress = ease_out_quad(t).min(0.95);
                    let bar_rect = Rect::from_xywh(progress_x, progress_y, progress_width * progress, progress_height).unwrap();
                    let mut bar_paint = Paint::default();
                    bar_paint.set_color_rgba8(255, 215, 0, 255); // VCP Cyber Gold
                    canvas.fill_rect(bar_rect, &bar_paint, Transform::identity(), None);

                    // Copy canvas to buffer, converting RGBA to BGRA for softbuffer
                    for (i, pixel) in buffer.iter_mut().enumerate() {
                        let x = (i % width as usize) as u32;
                        let y = (i / width as usize) as u32;
                        if let Some(p) = canvas.pixel(x, y) {
                             *pixel = ((p.alpha() as u32) << 24)
                                  | ((p.red() as u32) << 16)
                                  | ((p.green() as u32) << 8)
                                  | (p.blue() as u32);
                        }
                    }
                    
                    buffer.present().unwrap();
                }
                WindowEvent::MouseInput { state: ElementState::Pressed, button: MouseButton::Left, .. } => {
                    let _ = window_clone.drag_window();
                }
                WindowEvent::CloseRequested => elwt.exit(),
                _ => {}
            },
            Event::UserEvent(()) => elwt.exit(),
            Event::AboutToWait => {
                window_clone.request_redraw();
            }
            _ => {}
        }
    }).unwrap();
}
