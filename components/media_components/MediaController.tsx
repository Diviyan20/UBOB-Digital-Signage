import React, { useEffect, useState } from "react";

import { config } from "../api/client";

import { ImageComponent } from "./ImageComponent";
import { VideoComponent } from "./VideoComponent";

type MediaState =
  | "IMAGES"
  | "VIDEOS";

export const MediaController = () => {

  const [mediaState, setMediaState] = useState<MediaState>("IMAGES"); // Controls current screen mode

  /*
    * How long images show before videos start
 */
  const [stateInterval, setStateInterval] = useState(60000); // Used as a fallback if config fails

  /*
    * Fetch interval config from backend
 */
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch(config);
        const data = await response.json();

        setStateInterval(data.config.state_interval);
      }
      catch (error) {
        console.error("CONFIG ERROR: ", error);
      }
    };
    fetchConfig();
  }, []);

  /*
    * Switch from images -> videos
 */

  useEffect(() => {
    if (mediaState !== "IMAGES") {
      return;
    }

    const timer = setTimeout(() => {
      setMediaState("VIDEOS");
    }, stateInterval);

    return () => clearTimeout(timer);
  }, [mediaState, stateInterval]);

  /*
    Called after all videos finish
 */
  const handleVideosFinished = () => {
    setMediaState("IMAGES");
  };

  return (
    <>
      {mediaState === "IMAGES" && (
        <ImageComponent />
      )}

      {mediaState === "VIDEOS" && (
        <VideoComponent
          onAllVideosFinished={handleVideosFinished}
        />
      )}
    </>
  );

}