"use client";
import React, { useState, useRef, useEffect } from "react";
import { Member, Status } from "@/lib/api";

interface SwipeableMemberRowProps {
  member: Member & { registrationNumber?: string; department?: string };
  status: Status;
  onStatusChange: (newStatus: Status) => void;
  onEdit?: (member: Member) => void;
  onDelete?: (member: Member) => void;
}

export function SwipeableMemberRow({
  member,
  status,
  onStatusChange,
  onEdit,
  onDelete,
}: SwipeableMemberRowProps) {
  const isPresent = status === "Present";
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [swipedAnimation, setSwipedAnimation] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);
  const currentOffsetRef = useRef(0);

  // Threshold to trigger state change (50% of container width)
  const getThreshold = () => {
    if (containerRef.current) {
      return Math.max(120, containerRef.current.offsetWidth * 0.48);
    }
    return 150;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    // Don't drag if clicking action buttons (edit / delete)
    if ((e.target as HTMLElement).closest(".action-btn")) return;

    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    isHorizontalSwipe.current = null;
    currentOffsetRef.current = 0;
    setIsDragging(true);

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - startXRef.current;
    const deltaY = e.clientY - startYRef.current;

    // Detect if the user is scrolling vertically or swiping horizontally
    if (isHorizontalSwipe.current === null) {
      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          isHorizontalSwipe.current = true;
        } else {
          isHorizontalSwipe.current = false;
          setIsDragging(false);
          setOffsetX(0);
          return;
        }
      } else {
        return;
      }
    }

    if (!isHorizontalSwipe.current) return;

    const containerWidth = containerRef.current?.offsetWidth || 300;
    let clampedOffset = 0;

    if (!isPresent) {
      // When Absent: only allow swiping RIGHT (0 to containerWidth)
      if (deltaX > 0) {
        // Apply slight resistance past threshold
        const threshold = getThreshold();
        if (deltaX > threshold) {
          clampedOffset = threshold + (deltaX - threshold) * 0.25;
        } else {
          clampedOffset = deltaX;
        }
      } else {
        // Slight resistance dragging left
        clampedOffset = deltaX * 0.15;
      }
    } else {
      // When Present: only allow swiping LEFT (-containerWidth to 0)
      if (deltaX < 0) {
        const threshold = getThreshold();
        if (Math.abs(deltaX) > threshold) {
          clampedOffset = -(threshold + (Math.abs(deltaX) - threshold) * 0.25);
        } else {
          clampedOffset = deltaX;
        }
      } else {
        // Slight resistance dragging right
        clampedOffset = deltaX * 0.15;
      }
    }

    currentOffsetRef.current = clampedOffset;
    setOffsetX(clampedOffset);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    const threshold = getThreshold();
    const current = currentOffsetRef.current;

    if (!isPresent && current >= threshold) {
      // Successfully swiped right -> PRESENT
      setSwipedAnimation(true);
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try { navigator.vibrate(30); } catch {}
      }
      onStatusChange("Present");
    } else if (isPresent && current <= -threshold) {
      // Successfully swiped left -> ABSENT
      setSwipedAnimation(true);
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try { navigator.vibrate(30); } catch {}
      }
      onStatusChange("Absent");
    }

    // Reset offset with spring animation
    setOffsetX(0);
    currentOffsetRef.current = 0;
    isHorizontalSwipe.current = null;
  };

  useEffect(() => {
    if (swipedAnimation) {
      const timer = setTimeout(() => setSwipedAnimation(false), 300);
      return () => clearTimeout(timer);
    }
  }, [swipedAnimation]);

  const threshold = getThreshold();
  const progress = Math.min(1, Math.abs(offsetX) / threshold);
  const thresholdReached = Math.abs(offsetX) >= threshold;

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-xl select-none transition-all my-1.5"
      style={{ touchAction: "pan-y" }}
    >
      {/* BACKGROUND REVEAL LAYER */}
      <div
        className={`absolute inset-0 flex items-center justify-between px-6 transition-colors duration-200 ${
          !isPresent
            ? thresholdReached
              ? "bg-green-600"
              : "bg-gradient-to-r from-orange-600 via-orange-500 to-green-600"
            : thresholdReached
            ? "bg-red-700"
            : "bg-gradient-to-l from-red-600 via-red-800 to-neutral-900"
        }`}
      >
        {/* Left side indicator (When swiping right to Present) */}
        {!isPresent && (
          <div
            className="flex items-center gap-2 font-bold text-white transition-transform"
            style={{
              opacity: Math.max(0.2, progress),
              transform: `scale(${0.85 + progress * 0.25})`,
            }}
          >
            <span className="text-xl">✓</span>
            <span className="text-sm uppercase tracking-wider">
              {thresholdReached ? "Release for Present" : "Swipe to Present"}
            </span>
          </div>
        )}

        <div className="flex-1" />

        {/* Right side indicator (When swiping left to Absent) */}
        {isPresent && (
          <div
            className="flex items-center gap-2 font-bold text-white transition-transform"
            style={{
              opacity: Math.max(0.2, progress),
              transform: `scale(${0.85 + progress * 0.25})`,
            }}
          >
            <span className="text-sm uppercase tracking-wider">
              {thresholdReached ? "Release for Absent" : "Swipe to Absent"}
            </span>
            <span className="text-xl">✗</span>
          </div>
        )}
      </div>

      {/* FOREGROUND SWIPEABLE CARD */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`relative z-10 flex flex-wrap items-center justify-between p-4 cursor-grab active:cursor-grabbing border ${
          isPresent
            ? "bg-neutral-900/95 border-green-500/50 shadow-sm shadow-green-500/10"
            : "bg-neutral-900 border-white/10"
        } ${isDragging ? "transition-none shadow-xl" : "transition-transform duration-250 ease-out"}`}
        style={{
          transform: `translateX(${offsetX}px)`,
        }}
      >
        {/* Member Info */}
        <div className="flex items-center gap-3.5 min-w-[200px] flex-1">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold transition-all ${
              isPresent
                ? "bg-green-500/20 text-green-400 border border-green-500/40"
                : "bg-white/10 text-white/70 border border-white/10"
            }`}
          >
            {isPresent ? "✓" : "👤"}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-white text-base leading-tight">
                {member.name}
              </h4>
              {member.role === "Leader" && (
                <span className="rounded bg-orange-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-400 border border-orange-500/30">
                  Leader
                </span>
              )}
            </div>

            <p className="text-xs text-white/50 mt-0.5">
              {member.role === "Leader" ? "Team Leader" : "Team Member"}
              {(member as any).registrationNumber ? ` · ${(member as any).registrationNumber}` : ""}
              {(member as any).department ? ` · ${(member as any).department}` : ""}
            </p>

            {/* Subtle Swipe Guidance Hint */}
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
              {!isPresent ? (
                <span className="text-orange-400/80 font-medium flex items-center gap-1 animate-pulse">
                  Swipe right → Present
                </span>
              ) : (
                <span className="text-white/40 font-medium flex items-center gap-1">
                  ← Swipe left to Absent
                </span>
              )}
            </div>
          </div>
        </div>

        {/* State Badge & Action Buttons */}
        <div className="flex items-center gap-3 shrink-0 mt-2 sm:mt-0">
          {/* Status Display (Not a button) */}
          <div
            className={`rounded-full px-3.5 py-1 text-xs font-bold tracking-wide transition-all ${
              isPresent
                ? "bg-green-500/20 text-green-400 border border-green-500/40 shadow-sm shadow-green-500/20"
                : "bg-white/5 text-white/40 border border-white/10"
            }`}
          >
            {isPresent ? "✓ PRESENT" : "ABSENT"}
          </div>

          {/* Action buttons (Edit / Delete) — only shown when callbacks are provided */}
          {(onEdit || onDelete) && (
            <div className="flex items-center gap-1 border-l border-white/10 pl-2">
              {onEdit && (
                <button
                  type="button"
                  className="action-btn btn-ghost !px-2 !py-1 text-xs text-white/60 hover:text-white"
                  aria-label={`Edit ${member.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(member);
                  }}
                >
                  ✎
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  className="action-btn btn-ghost !px-2 !py-1 text-xs text-red-400/70 hover:text-red-400"
                  aria-label={`Delete ${member.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(member);
                  }}
                >
                  🗑
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
