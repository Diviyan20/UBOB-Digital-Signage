export interface PromotionVideo{
    id: string;
    name: string;
    videoURI: string;
}

export const promotionVideos: PromotionVideo[] = [
    {
        id: "promo_1",
        name: "Korean Fried Chicken Sabah",
        videoURI: require("../../assets/ub_landscape_videos/korean_fried_chicken_sabah_tv.mp4")
    },

    {
        id: "promo_2",
        name: "Sarawak Satay Bobbie Bun",
        videoURI: require("../../assets/ub_landscape_videos/sarawak_satay_bobbie_bun_horizontal_p_01.mp4")
    },

    {
        id: "promo_3",
        name: "Uncle Bob Landscape",
        videoURI: require("../../assets/ub_landscape_videos/ub_landscape_p_04.mp4")
    },

    {
        id: "promo_4",
        name: "Uncle Bob 4K",
        videoURI: require("../../assets/ub_landscape_videos/ub_4k_horizontal_p_01.mp4")
    },
];