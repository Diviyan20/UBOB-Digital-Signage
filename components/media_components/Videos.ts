export interface PromotionVideo{
    id: string;
    videoURI: string;
    rotate?: boolean; // Used only if the videos are not upright
}
export const promotionVideos: PromotionVideo[] = [
    {
        id: "promo_1",
        videoURI: require("../../assets/ub_portrait_videos/rotate_ub_video.mp4"),
        rotate: true
    },

    {
        id: "promo_2",
        videoURI: require("../../assets/ub_portrait_videos/ub_staff_video_portrait.mp4"),
        rotate: true
    },

    {
        id: "promo_3",
        videoURI: require("../../assets/ub_portrait_videos/portrait_promo_video.mp4"),
        rotate: true
    },
    
    {
        id: "promo_4",
        videoURI: require("../../assets/ub_landscape_videos/sarawak_satay_bobbie_bun_horizontal_p_01.mp4")
    },

    {
        id: "promo_5",
        videoURI: require("../../assets/ub_landscape_videos/ub_landscape_p_04.mp4")
    },

    {
        id: "promo_6",
        videoURI: require("../../assets/ub_landscape_videos/ub_4k_horizontal_p_01.mp4")
    },

    {
        id: "promo_7",
        videoURI: require("../../assets/ub_landscape_videos/korean_fried_chicken_sabah_tv.mp4")
    },

];