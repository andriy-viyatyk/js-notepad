import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

function RootComponent() {
    const [content, setContent] = useState(null);

    useEffect(() => {
        const importMainModule = async () => {
        const cont = await import("./renderer/index");
            setContent(<cont.default />);
        };
        importMainModule();
    }, []);

    return content;
}

const container = document.getElementById("root");
if (container) {
    const root = createRoot(container);
    root.render(<RootComponent />);
}