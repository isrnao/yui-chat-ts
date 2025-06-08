import { useRef, useState, useEffect, isValidElement } from "react";
import type { ReactNode } from "react";

export default function RetroSplitter({
    top,
    bottom,
    minTop = 10,
    minBottom = 10,
}: {
    top: ReactNode;
    bottom: ReactNode;
    minTop?: number;
    minBottom?: number;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    // 3:7の割合で初期化
    const [topHeight, setTopHeight] = useState(30); // 30%（下側は70%）
    const isDragging = useRef(false);

    const onMouseMove = (e: MouseEvent) => {
        if (!isDragging.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        // 割合で高さを計算
        let percent = ((e.clientY - rect.top) / rect.height) * 100;
        if (percent < (minTop / rect.height) * 100) percent = (minTop / rect.height) * 100;
        if (percent > 100 - (minBottom / rect.height) * 100) percent = 100 - (minBottom / rect.height) * 100;
        setTopHeight(percent);
    };
    const onMouseUp = () => {
        isDragging.current = false;
        document.body.style.cursor = "";
    };

    // イベントリスナー登録/解除
    useEffect(() => {
        if (isDragging.current) {
            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", onMouseUp);
        }
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
        // eslint-disable-next-line
    }, [isDragging.current]);

    // 入室状態の変化で上部エリアの高さを変更
    useEffect(() => {
        if (typeof window !== "undefined" && top && bottom) {
            // 入室後(topがChatRoom)なら20%、それ以外は30%
            if (
                isValidElement(top) &&
                typeof top.type === "function" &&
                top.type.name === "ChatRoom"
            ) {
                setTopHeight(18);
            } else {
                setTopHeight(26);
            }
        }
    }, [top, bottom]);

    return (
        <div
            ref={containerRef}
            className="flex flex-col bg-transparent select-none min-h-screen h-screen"
            style={{ height: '100vh' }}
        >
            {/* 上側エリア */}
            <div style={{ height: `${topHeight}%`, minHeight: minTop, overflow: "auto" }}>
                {top}
            </div>
            {/* レトロ分割バー */}
            <hr className="border-0 border-t-2 border-b border-t-[var(--ie-gray)] border-b-white h-0 my-2"/>
            {/* 下側エリア */}
            <div style={{ height: `${100 - topHeight}%`, minHeight: minBottom, overflow: "auto" }}>
                {bottom}
            </div>
        </div>
    );
}
