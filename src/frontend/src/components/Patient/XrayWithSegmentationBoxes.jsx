import React, { useRef, useState, useEffect } from "react";

export const XrayWithSegmentationBoxes = ({
  src,
  boundingBoxes,
  onSelectLabel,
  selectedLabel,
  flaggedLabels = [],
}) => {
  const parentRef = useRef(null);
  const [parentDimensions, setParentDimensions] = useState({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const updateDimensions = () => {
      if (parentRef.current) {
        const { offsetWidth, offsetHeight } = parentRef.current;
        setParentDimensions({ width: offsetWidth, height: offsetHeight });
      }
    };

    updateDimensions();

    const observer = new ResizeObserver(updateDimensions);
    if (parentRef.current) {
      observer.observe(parentRef.current);
    }

    return () => {
      if (parentRef.current) {
        observer.unobserve(parentRef.current);
      }
    };
  }, [parentRef]);

  return (
    <div ref={parentRef} style={{ position: "relative" }}>
      <img
        src={src}
        alt="X-ray"
        width={800}
        height={800}
        className="block w-full h-auto rounded-sm"
      />
      {boundingBoxes.map((box, index) => (
        <SegmentationBoxes
          key={index}
          imageWidth={parentDimensions.width}
          imageHeight={parentDimensions.height}
          x1={box.x1}
          y1={box.y1}
          x2={box.x2}
          y2={box.y2}
          options={{
            label: box.label,
            onSelectLabel: onSelectLabel,
            selectedLabel: selectedLabel,
            isFlagged: flaggedLabels.includes(box.label),
          }}
        />
      ))}
    </div>
  );
};

const SegmentationBoxes = ({
  imageWidth,
  imageHeight,
  x1,
  y1,
  x2,
  y2,
  options,
}) => {
  const { color, label, onSelectLabel, selectedLabel, isFlagged } = options;
  const isSelected = selectedLabel === label;
  // red-400 (as r, g, b) stays visible on the grey of an X-ray
  const flagRgb = "248, 113, 113";
  const style = {
    position: "absolute",
    border: isSelected
      ? `2px solid ${isFlagged ? `rgb(${flagRgb})` : "var(--color-secondary)"}`
      : isFlagged
      ? `1.5px solid rgba(${flagRgb}, 0.85)`
      : "1px dashed rgba(255, 255, 255, 0.3)",
    boxSizing: "border-box",
    width: `${(x2 - x1) * imageWidth}px`,
    height: `${(y2 - y1) * imageHeight}px`,
    left: `${x1 * imageWidth}px`,
    top: `${y1 * imageHeight}px`,
    backgroundColor: isSelected
      ? isFlagged
        ? `rgba(${flagRgb}, 0.18)`
        : "rgba(104, 176, 231, 0.16)"
      : "transparent",
    transition: 'all 0.2s ease-in-out',
  };

  return (
    <div
      onClick={() => onSelectLabel(label)}
      style={style}
      className={
        "hover:z-10 hover:scale-105 ease-in-out hover:duration-300 cursor-pointer"
      }
    ></div>
  );
};

export default XrayWithSegmentationBoxes;
