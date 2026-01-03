import { forwardRef, ReactElement, ReactNode, SVGProps } from "react";

export interface SvgIconProps extends SVGProps<SVGSVGElement> {
    children?: ReactNode;
    viewBox?: string;
    title?: string;
}

export type SvgIconComponent = (props: SvgIconProps) => ReactElement;

const SvgIcon = forwardRef<SVGSVGElement, SvgIconProps>(
    function SvgIcon(props, ref) {
        const {
            children,
            viewBox = "0 0 24 24",
            width = 24,
            height = 24,
            title,
            color,
            ...otherProps
        } = props;

        return (
            <svg
                ref={ref}
                viewBox={viewBox}
                width={width}
                height={height}
                color={color}
                style={{ color }}
                {...otherProps}
            >
                {title && <title>{title}</title>}
                {children}
            </svg>
        );
    }
);

export const createIconWithViewBox = (viewBox: string) => (icon: ReactNode) =>
    forwardRef<SVGSVGElement>(function IconWithViewBox(
        props: SvgIconProps,
        ref
    ) {
        return (
            <SvgIcon {...props} viewBox={viewBox} ref={ref}>
                {icon}
            </SvgIcon>
        );
    }) as (props: SvgIconProps) => ReactElement;

export const createIcon = (size: number | string) =>
    createIconWithViewBox(`0 0 ${size} ${size}`);

export const WindowMaximizeIcon = createIcon(36)(
    <>
        <path
            d="M27.89,9h-20a2,2,0,0,0-2,2V25a2,2,0,0,0,2,2h20a2,2,0,0,0,2-2V11A2,2,0,0,0,27.89,9Zm-20,16V11h20V25Z"
            fill="currentColor"
        />
        <rect x="0" y="0" width="36" height="36" fillOpacity="0" />
    </>
);

export const WindowRestoreIcon = createIcon(36)(
    <>
        <path
            d="M28,8H14a2,2,0,0,0-2,2v2h2V10H28V20H26v2h2a2,2,0,0,0,2-2V10A2,2,0,0,0,28,8Z"
            fill="currentColor"
        />
        <path
            d="M22,14H8a2,2,0,0,0-2,2V26a2,2,0,0,0,2,2H22a2,2,0,0,0,2-2V16A2,2,0,0,0,22,14ZM8,26V16H22V26Z"
            fill="currentColor"
        />
        <rect x="0" y="0" width="36" height="36" fillOpacity="0" />
    </>
);

export const WindowMinimizeIcon = createIcon(36)(
    <>
        <path
            d="M27,27H9a1,1,0,0,1,0-2H27a1,1,0,0,1,0,2Z"
            fill="currentColor"
        />
        <rect x="0" y="0" width="36" height="36" fillOpacity="0" />
    </>
);

export const CloseIcon = createIcon(24)(
    <g id="Page-1" stroke="none" strokeWidth="1" fill="none" fillRule="evenodd">
        <g id="Close">
            <line
                x1="16.9999"
                y1="7"
                x2="7.00001"
                y2="16.9999"
                id="Path"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
            />
            <line
                x1="7.00006"
                y1="7"
                x2="17"
                y2="16.9999"
                id="Path"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
            />
        </g>
    </g>
);

export const ProgressIcon = createIcon(32)(
    <>
        <path
            d="M17.4378 30.9492C17.4378 31.8057 16.794 32.5 15.9999 32.5C15.2058 32.5 14.562 31.8057 14.562 30.9492V26.6661C14.562 25.8097 15.2058 25.1154 15.9999 25.1154C16.794 25.1154 17.4378 25.8097 17.4378 26.6661V30.9492Z"
            fill="currentColor"
            fillOpacity="0.5"
        />
        <path
            d="M25.8454 27.3629C26.36 28.0558 26.2564 28.9877 25.6139 29.4443C24.9715 29.9009 24.0335 29.7094 23.5188 29.0165L20.9453 25.5514C20.4307 24.8585 20.5343 23.9266 21.1768 23.47C21.8192 23.0134 22.7572 23.2049 23.2719 23.8978L25.8454 27.3629Z"
            fill="currentColor"
            fillOpacity="0.6"
        />
        <path
            d="M30.4922 19.6273C31.3248 19.8919 31.8009 20.7054 31.5555 21.4442C31.3101 22.1831 30.4362 22.5674 29.6035 22.3028L25.4394 20.9792C24.6067 20.7146 24.1306 19.9011 24.376 19.1623C24.6214 18.4234 25.4954 18.0391 26.328 18.3037L30.4922 19.6273Z"
            fill="currentColor"
            fillOpacity="0.7"
        />
        <path
            d="M29.6036 10.6972C30.4363 10.4325 31.3103 10.8169 31.5557 11.5557C31.8011 12.2945 31.325 13.108 30.4923 13.3727L26.3282 14.6962C25.4955 14.9609 24.6215 14.5765 24.3761 13.8377C24.1307 13.0989 24.6068 12.2854 25.4395 12.0207L29.6036 10.6972Z"
            fill="currentColor"
            fillOpacity="0.8"
        />
        <path
            d="M23.5189 3.98348C24.0335 3.29059 24.9715 3.09904 25.614 3.55566C26.2564 4.01228 26.3601 4.94414 25.8454 5.63704L23.2719 9.10213C22.7573 9.79503 21.8192 9.98657 21.1768 9.52996C20.5343 9.07334 20.4307 8.14147 20.9453 7.44858L23.5189 3.98348Z"
            fill="currentColor"
            fillOpacity="0.9"
        />
        <path
            d="M14.5622 2.05077C14.5622 1.1943 15.206 0.5 16.0001 0.5C16.7942 0.5 17.438 1.1943 17.438 2.05077V6.33386C17.438 7.19033 16.7942 7.88463 16.0001 7.88463C15.206 7.88463 14.5622 7.19033 14.5622 6.33386V2.05077Z"
            fill="currentColor"
        />
        <path
            d="M6.15458 5.63709C5.63996 4.94419 5.74359 4.01232 6.38606 3.55571C7.02853 3.09909 7.96653 3.29063 8.48116 3.98353L11.0547 7.44862C11.5693 8.14152 11.4657 9.07339 10.8232 9.53C10.1808 9.98662 9.24277 9.79507 8.72815 9.10218L6.15458 5.63709Z"
            fill="currentColor"
            fillOpacity="0.1"
        />
        <path
            d="M1.50783 13.3727C0.675156 13.1081 0.199073 12.2946 0.444473 11.5558C0.689873 10.8169 1.56383 10.4326 2.39651 10.6972L6.56063 12.0208C7.3933 12.2854 7.86939 13.0989 7.62399 13.8377C7.37859 14.5766 6.50463 14.9609 5.67195 14.6963L1.50783 13.3727Z"
            fill="currentColor"
            fillOpacity="0.2"
        />
        <path
            d="M2.39637 22.3028C1.56369 22.5675 0.689736 22.1831 0.444336 21.4443C0.198936 20.7055 0.675019 19.892 1.5077 19.6273L5.67182 18.3038C6.50449 18.0391 7.37845 18.4235 7.62385 19.1623C7.86925 19.9011 7.39317 20.7146 6.56049 20.9793L2.39637 22.3028Z"
            fill="currentColor"
            fillOpacity="0.3"
        />
        <path
            d="M8.48113 29.0165C7.96651 29.7094 7.0285 29.901 6.38604 29.4443C5.74357 28.9877 5.63993 28.0559 6.15456 27.363L8.72812 23.8979C9.24275 23.205 10.1808 23.0134 10.8232 23.47C11.4657 23.9267 11.5693 24.8585 11.0547 25.5514L8.48113 29.0165Z"
            fill="currentColor"
            fillOpacity="0.4"
        />
    </>
);

export const JsNotepadIcon = createIconWithViewBox("2 2 20 20")(
    <g fill="note">
        <path
            d="M8 5C7 5 6 5.5 6 7V9.5C6 10.5 5.5 11 4.5 11.5C5.5 12 6 12.5 6 13.5V16C6 17.5 7 18 8 18"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            fill="none"
        />

        <path
            d="M16 5C17 5 18 5.5 18 7V9.5C18 10.5 18.5 11 19.5 11.5C18.5 12 18 12.5 18 13.5V16C18 17.5 17 18 16 18"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            fill="none"
        />

        <rect x="9" y="8" width="6" height="8" stroke="currentColor" rx="0.5" />
    </g>
);

export const PlusIcon = createIcon(24)(
    <path
        d="M6 12H18M12 6V18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
    />
);

export const CircleIcon = createIcon(24)(
    <circle cx="12" cy="12" r="5" fill="currentColor" />
);

export const FilterArrowUpIcon = createIcon(16)(
    <>
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M8 13.1667C8.27614 13.1667 8.5 12.9428 8.5 12.6667V3.33336C8.5 3.05722 8.27614 2.83336 8 2.83336C7.72386 2.83336 7.5 3.05722 7.5 3.33336V12.6667C7.5 12.9428 7.72386 13.1667 8 13.1667Z"
            fill="currentColor"
        />
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M2.97945 8.3535C3.17472 8.54876 3.4913 8.54876 3.68656 8.3535L7.99967 4.04039L12.3128 8.3535C12.508 8.54876 12.8246 8.54876 13.0199 8.3535C13.2152 8.15824 13.2152 7.84166 13.0199 7.6464L8.35323 2.97973C8.15797 2.78447 7.84138 2.78447 7.64612 2.97973L2.97945 7.6464C2.78419 7.84166 2.78419 8.15824 2.97945 8.3535Z"
            fill="currentColor"
        />
    </>
);

export const FilterArrowDownIcon = createIcon(16)(
    <>
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M8 2.83334C8.27615 2.83334 8.5 3.0572 8.5 3.33334V12.6667C8.5 12.9428 8.27615 13.1667 8 13.1667C7.72386 13.1667 7.5 12.9428 7.5 12.6667V3.33334C7.5 3.0572 7.72386 2.83334 8 2.83334Z"
            fill="currentColor"
        />
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M2.97978 7.64646C3.17504 7.45119 3.49163 7.45119 3.68689 7.64646L8 11.9596L12.3131 7.64646C12.5084 7.45119 12.825 7.45119 13.0202 7.64646C13.2155 7.84172 13.2155 8.1583 13.0202 8.35356L8.35356 13.0202C8.15829 13.2155 7.84171 13.2155 7.64645 13.0202L2.97978 8.35356C2.78452 8.1583 2.78452 7.84172 2.97978 7.64646Z"
            fill="currentColor"
        />
    </>
);

export const ArrowUpIcon = createIcon(24)(
    <path
        d="M19 15L12 9L5 15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
    />
);

export const ArrowDownIcon = createIcon(24)(
    <path
        d="M19 9L12 15L5 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
    />
);

export const ArrowRightIcon = createIcon(24)(
    <path
        d="M9 5L15 12L9 19"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
    />
);

export const ArrowLeftIcon = createIcon(24)(
    <path
        d="M15 5L9 12L15 19"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
    />
);

export const ConfirmIcon = createIcon(24)(
    <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2.75C6.89137 2.75 2.75 6.89137 2.75 12C2.75 17.1086 6.89137 21.25 12 21.25C17.1086 21.25 21.25 17.1086 21.25 12C21.25 6.89137 17.1086 2.75 12 2.75ZM1.25 12C1.25 6.06294 6.06294 1.25 12 1.25C17.9371 1.25 22.75 6.06294 22.75 12C22.75 17.9371 17.9371 22.75 12 22.75C6.06294 22.75 1.25 17.9371 1.25 12ZM12 7.75C11.3787 7.75 10.875 8.25368 10.875 8.875C10.875 9.28921 10.5392 9.625 10.125 9.625C9.71079 9.625 9.375 9.28921 9.375 8.875C9.375 7.42525 10.5503 6.25 12 6.25C13.4497 6.25 14.625 7.42525 14.625 8.875C14.625 9.83834 14.1056 10.6796 13.3353 11.1354C13.1385 11.2518 12.9761 11.3789 12.8703 11.5036C12.7675 11.6246 12.75 11.7036 12.75 11.75V13C12.75 13.4142 12.4142 13.75 12 13.75C11.5858 13.75 11.25 13.4142 11.25 13V11.75C11.25 11.2441 11.4715 10.8336 11.7266 10.533C11.9786 10.236 12.2929 10.0092 12.5715 9.84439C12.9044 9.64739 13.125 9.28655 13.125 8.875C13.125 8.25368 12.6213 7.75 12 7.75ZM12 17C12.5523 17 13 16.5523 13 16C13 15.4477 12.5523 15 12 15C11.4477 15 11 15.4477 11 16C11 16.5523 11.4477 17 12 17Z"
        fill="currentColor"
    />
);

export const ErrorIcon = createIcon(24)(
    <>
        <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
        />
        <path
            d="M12 7V13"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
        />
        <circle cx="12" cy="16" r="1" fill="currentColor" />
    </>
);

export const InfoIcon = createIcon(24)(
    <>
        <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
        />
        <path
            d="M12 17V11"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
        />
        <circle
            cx="1"
            cy="1"
            r="1"
            transform="matrix(1 0 0 -1 11 9)"
            fill="currentColor"
        />
    </>
);

export const SuccessIcon = createIcon(24)(
    <>
        <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
        />
        <path
            d="M8.5 12.5L10.5 14.5L15.5 9.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </>
);

export const WarningIcon = createIcon(24)(
    <>
        <path
            d="M5.31171 10.7615C8.23007 5.58716 9.68925 3 12 3C14.3107 3 15.7699 5.58716 18.6883 10.7615L19.0519 11.4063C21.4771 15.7061 22.6897 17.856 21.5937 19.428C20.4978 21 17.7864 21 12.3637 21H11.6363C6.21356 21 3.50217 21 2.40626 19.428C1.31034 17.856 2.52291 15.7061 4.94805 11.4063L5.31171 10.7615Z"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
        />
        <path
            d="M12 8V13"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
        />
        <circle cx="12" cy="16" r="1" fill="currentColor" />
    </>
);

export const ResizeHandleIcon = createIcon(24)(
    <path
        d="M21 15L15 21M21 8L8 21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    />
);

export const CopyIcon = createIcon(24)(
    <>
        <path
            d="M6 11C6 8.17157 6 6.75736 6.87868 5.87868C7.75736 5 9.17157 5 12 5H15C17.8284 5 19.2426 5 20.1213 5.87868C21 6.75736 21 8.17157 21 11V16C21 18.8284 21 20.2426 20.1213 21.1213C19.2426 22 17.8284 22 15 22H12C9.17157 22 7.75736 22 6.87868 21.1213C6 20.2426 6 18.8284 6 16V11Z"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
        />
        <path
            d="M6 19C4.34315 19 3 17.6569 3 16V10C3 6.22876 3 4.34315 4.17157 3.17157C5.34315 2 7.22876 2 11 2H15C16.6569 2 18 3.34315 18 5"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
        />
    </>
);

export const CursorIcon = createIcon(24)(
    <path
        d="M16.5744 19.1999L12.6361 15.2616L11.4334 16.4643C10.2022 17.6955 9.58656 18.3111 8.92489 18.1658C8.26322 18.0204 7.96225 17.2035 7.3603 15.5696L5.3527 10.1205C4.15187 6.86106 3.55146 5.23136 4.39141 4.39141C5.23136 3.55146 6.86106 4.15187 10.1205 5.35271L15.5696 7.3603C17.2035 7.96225 18.0204 8.26322 18.1658 8.92489C18.3111 9.58656 17.6955 10.2022 16.4643 11.4334L15.2616 12.6361L19.1999 16.5744C19.6077 16.9821 19.8116 17.186 19.9058 17.4135C20.0314 17.7168 20.0314 18.0575 19.9058 18.3608C19.8116 18.5882 19.6077 18.7921 19.1999 19.1999C18.7921 19.6077 18.5882 19.8116 18.3608 19.9058C18.0575 20.0314 17.7168 20.0314 17.4135 19.9058C17.186 19.8116 16.9821 19.6077 16.5744 19.1999Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
    />
);

export const EmptyIcon = createIcon(24)(<></>);

export const CheckIcon = createIcon(16)(
    <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M13.8494 3.15816C14.0502 3.36905 14.0502 3.71095 13.8494 3.92184L6.30651 11.8418C6.10567 12.0527 5.78004 12.0527 5.5792 11.8418L2.15063 8.24184C1.94979 8.03095 1.94979 7.68905 2.15063 7.47816C2.35147 7.26728 2.6771 7.26728 2.87794 7.47816L5.94286 10.6963L13.1221 3.15816C13.3229 2.94728 13.6485 2.94728 13.8494 3.15816Z"
        fill="currentColor"
    />
);

export const OpenFileIcon = createIcon(24)(
    <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M1 5C1 3.34315 2.34315 2 4 2H8.55848C9.84977 2 10.9962 2.82629 11.4045 4.05132L11.7208 5H20C21.1046 5 22 5.89543 22 7V9.00961C23.1475 9.12163 23.9808 10.196 23.7695 11.3578L22.1332 20.3578C21.9603 21.3087 21.132 22 20.1654 22H3C1.89543 22 1 21.1046 1 20V5ZM20 9V7H11.7208C10.8599 7 10.0956 6.44914 9.82339 5.63246L9.50716 4.68377C9.37105 4.27543 8.98891 4 8.55848 4H4C3.44772 4 3 4.44772 3 5V12.2709L3.35429 10.588C3.54913 9.66249 4.36562 9 5.31139 9H20ZM3.36634 20C3.41777 19.9109 3.4562 19.8122 3.47855 19.706L5.31139 11L21 11H21.8018L20.1654 20L3.36634 20Z"
        fill="currentColor"
    />
);

export const NewWindowIcon = createIcon(18)(
    <g>
        <path
            fill="currentColor"
            d="M12.1.6a.944.944 0 0 0 .2 1.04l1.352 1.353L10.28 6.37a.956.956 0 0 0 1.35 1.35l3.382-3.38 1.352 1.352a.944.944 0 0 0 1.04.2.958.958 0 0 0 .596-.875V.96a.964.964 0 0 0-.96-.96h-4.057a.958.958 0 0 0-.883.6z"
        />
        <path
            fill="currentColor"
            d="M14 11v5a2.006 2.006 0 0 1-2 2H2a2.006 2.006 0 0 1-2-2V6a2.006 2.006 0 0 1 2-2h5a1 1 0 0 1 0 2H2v10h10v-5a1 1 0 0 1 2 0z"
        />
    </g>
);

export const GroupIcon = createIcon(24)(
    <g fill="currentColor">
        <path d="M21,18.3v-6.6c0.6-0.3,1-1,1-1.7c0-1.1-0.9-2-2-2c-0.7,0-1.4,0.4-1.7,1H15V5.7c0.6-0.3,1-1,1-1.7c0-1.1-0.9-2-2-2c-0.7,0-1.4,0.4-1.7,1H5.7C5.4,2.4,4.7,2,4,2C2.9,2,2,2.9,2,4c0,0.7,0.4,1.4,1,1.7v6.6c-0.6,0.3-1,1-1,1.7c0,1.1,0.9,2,2,2c0.7,0,1.4-0.4,1.7-1H9v3.3c-0.6,0.3-1,1-1,1.7c0,1.1,0.9,2,2,2c0.7,0,1.4-0.4,1.7-1h6.6c0.3,0.6,1,1,1.7,1c1.1,0,2-0.9,2-2C22,19.3,21.6,18.6,21,18.3z M5.7,13c-0.2-0.3-0.4-0.5-0.7-0.7V5.7C5.3,5.5,5.5,5.3,5.7,5h6.6c0.2,0.3,0.4,0.5,0.7,0.7V9h-1.3c-0.3-0.6-1-1-1.7-1c-1.1,0-2,0.9-2,2c0,0.7,0.4,1.4,1,1.7V13H5.7z M13,12.3c-0.3,0.2-0.5,0.4-0.7,0.7H11v-1.3c0.3-0.2,0.5-0.4,0.7-0.7H13V12.3z M12.3,15c0.3,0.6,1,1,1.7,1c1.1,0,2-0.9,2-2c0-0.7-0.4-1.4-1-1.7V11h3.3c0.2,0.3,0.4,0.5,0.7,0.7v6.6c-0.3,0.2-0.5,0.4-0.7,0.7h-6.6c-0.2-0.3-0.4-0.5-0.7-0.7V15H12.3z" />
    </g>
);

export const RunIcon = createIcon(16)(
    <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M4.25 3l1.166-.624 8 5.333v1.248l-8 5.334-1.166-.624V3zm1.5 1.401v7.864l5.898-3.932L5.75 4.401z"
    />
);
