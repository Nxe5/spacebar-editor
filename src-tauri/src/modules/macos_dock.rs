//! Adds a "New Window" item to the Dock's right-click menu on macOS.
//!
//! Tauri (via `tao`) has no API for this — `NSApplicationDelegate`'s
//! optional `applicationDockMenu:` method is simply never implemented by
//! tao's delegate class, and this is an open, unresolved upstream feature
//! request (tauri-apps/tauri#4520). We patch it in at the Objective-C
//! runtime level: this is the standard technique for adding an optional,
//! fully public/documented protocol method to a delegate class we don't own
//! the source of (the same approach other cross-platform frameworks use for
//! the same gap). We are not touching any private/undocumented API —
//! `applicationDockMenu:` is a normal `NSApplicationDelegate` method; we're
//! just installing an implementation for it via `class_addMethod` instead of
//! source-level protocol conformance, since tao's delegate class isn't ours
//! to edit.
//!
//! Risk: this relies on tao continuing to install *some* NSApplicationDelegate
//! and not already implementing `applicationDockMenu:` itself. If a future
//! tao/Tauri upgrade changes that, `install()` degrades to a no-op (the
//! `delegate()` or `class_addMethod` calls simply do nothing useful) rather
//! than crashing — the Dock keeps its default right-click menu.

use objc2::rc::Retained;
use objc2::runtime::{AnyClass, AnyObject, Sel};
use objc2::{define_class, msg_send, sel, MainThreadOnly};
use objc2_app_kit::{NSApplication, NSMenu, NSMenuItem};
use objc2_foundation::{ns_string, MainThreadMarker, NSObject, NSObjectProtocol};
use std::sync::OnceLock;

/// Objects that are only ever touched from the main thread (Cocoa requires
/// this of AppKit objects anyway: `install()` runs from Tauri's `.setup()`
/// on the main thread, and both `applicationDockMenu:` and the menu item's
/// action are invoked by AppKit only on the main thread). This wrapper just
/// satisfies the `static` item's `Sync` requirement — it adds no actual
/// cross-thread access.
struct MainThreadOnlyBox<T>(T);
unsafe impl<T> Send for MainThreadOnlyBox<T> {}
unsafe impl<T> Sync for MainThreadOnlyBox<T> {}

/// Rust callback invoked when the Dock's "New Window" item is clicked.
/// Stashed once at `install()` time since the Objective-C target object
/// can't hold a Tauri `AppHandle` directly.

static ON_NEW_WINDOW: OnceLock<Box<dyn Fn() + Send + Sync>> = OnceLock::new();

// Kept alive for the process lifetime — a static Dock menu never needs to be
// dropped, and Cocoa expects `applicationDockMenu:` to return a live object
// on every call.
static DOCK_MENU: OnceLock<MainThreadOnlyBox<Retained<NSMenu>>> = OnceLock::new();
static DOCK_MENU_TARGET: OnceLock<MainThreadOnlyBox<Retained<DockMenuTarget>>> = OnceLock::new();

#[derive(Default)]
struct DockMenuTargetIvars;

define_class!(
    #[unsafe(super = NSObject)]
    #[thread_kind = MainThreadOnly]
    #[ivars = DockMenuTargetIvars]
    #[name = "SpacebarDockMenuTarget"]
    struct DockMenuTarget;

    // SAFETY: `NSObjectProtocol` has no safety requirements.
    unsafe impl NSObjectProtocol for DockMenuTarget {}

    impl DockMenuTarget {
        #[unsafe(method(newWindowFromDock:))]
        fn new_window_from_dock(&self, _sender: &AnyObject) {
            if let Some(cb) = ON_NEW_WINDOW.get() {
                cb();
            }
        }
    }
);

impl DockMenuTarget {
    fn new(mtm: MainThreadMarker) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(DockMenuTargetIvars);
        // SAFETY: `NSObject`'s `init` has no arguments and always succeeds.
        unsafe { msg_send![super(this), init] }
    }
}

/// The `applicationDockMenu:` implementation installed onto tao's delegate
/// class. Signature must match `- (NSMenu *)applicationDockMenu:(NSApplication *)sender`
/// exactly: `(id, SEL, id) -> id`.
unsafe extern "C-unwind" fn application_dock_menu(
    _this: &AnyObject,
    _cmd: Sel,
    _sender: &NSApplication,
) -> *const NSMenu {
    DOCK_MENU
        .get()
        .map(|menu| Retained::as_ptr(&menu.0))
        .unwrap_or(std::ptr::null())
}

/// Installs the "New Window" Dock menu item and wires it to `on_new_window`.
/// Call once from `main.rs`'s `.setup()`, after the app delegate exists.
pub fn install(mtm: MainThreadMarker, on_new_window: impl Fn() + Send + Sync + 'static) {
    let _ = ON_NEW_WINDOW.set(Box::new(on_new_window));

    let target = DockMenuTarget::new(mtm);
    let menu = NSMenu::new(mtm);
    unsafe {
        let item = NSMenuItem::new(mtm);
        item.setTitle(ns_string!("New Window"));
        item.setTarget(Some(&target));
        item.setAction(Some(sel!(newWindowFromDock:)));
        menu.addItem(&item);
    }
    let _ = DOCK_MENU_TARGET.set(MainThreadOnlyBox(target));
    let _ = DOCK_MENU.set(MainThreadOnlyBox(menu));

    let app = NSApplication::sharedApplication(mtm);
    let Some(delegate) = app.delegate() else {
        return;
    };

    // SAFETY: adds the optional `applicationDockMenu:` method to the live
    // delegate class via the Objective-C runtime. `application_dock_menu`'s
    // signature exactly matches what Cocoa will invoke it with; the type
    // encoding string ("@@:@": id return, id self, SEL _cmd, id arg) matches
    // the four-slot call. The delegate class is guaranteed to already be
    // registered (it's the live delegate of the running NSApplication), so
    // `class_addMethod` is safe to call on it at any time.
    unsafe {
        let delegate_obj: &AnyObject = delegate.as_ref();
        let cls: &'static AnyClass = delegate_obj.class();
        let cls_mut = (cls as *const AnyClass) as *mut AnyClass;
        let imp: objc2::runtime::Imp = std::mem::transmute::<
            unsafe extern "C-unwind" fn(&AnyObject, Sel, &NSApplication) -> *const NSMenu,
            objc2::runtime::Imp,
        >(application_dock_menu);
        let encoding = c"@@:@";
        objc2::ffi::class_addMethod(cls_mut, sel!(applicationDockMenu:), imp, encoding.as_ptr());
    }
}
