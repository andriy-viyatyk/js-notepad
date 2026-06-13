fn main() {
    let mut res = winres::WindowsResource::new();
    res.set_icon("../assets/icon.ico");
    res.set("ProductName", "Persephone");
    res.set("FileDescription", "Persephone Mneme (knowledge-base service)");
    res.set("CompanyName", "persephone");
    res.set("LegalCopyright", "MIT License");
    res.compile().expect("Failed to compile Windows resources");
}
